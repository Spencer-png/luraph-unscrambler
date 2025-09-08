import { ProgramNode, ASTNode, VMHandlerNode, EncryptedStringNode, ConstantTableNode, FunctionDeclarationNode, CallExpressionNode } from './types/ASTNodes';
import { LuraphVMContext, LuraphVMHandler, VMConstant, VMProto, LuaOpcode, DeobfuscationContext } from './types/VMInstructions';
import { LuraphDecryptor, EncryptionInfo } from './LuraphDecryptor';
import { SymbolicExecutor } from './SymbolicExecutor';
import { BytecodeReconstructor, ReconstructionContext } from './BytecodeReconstructor';

export class LuraphVM {
  private vmContext: LuraphVMContext;
  private handlers: Map<number, LuraphVMHandler> = new Map();
  private constants: VMConstant[] = [];
  private encryptionKey: string = '';
  private decryptor: LuraphDecryptor;
  private symbolicExecutor: SymbolicExecutor;
  private bytecodeReconstructor: BytecodeReconstructor;
  private encryptionInfo: EncryptionInfo;

  constructor() {
    this.vmContext = {
      handlers: new Map(),
      constants: [],
      vmVersion: '11.8.1'
    };
    this.decryptor = new LuraphDecryptor();
    this.symbolicExecutor = new SymbolicExecutor();
    this.bytecodeReconstructor = new BytecodeReconstructor();
    this.encryptionInfo = {
      method: 'auto',
      key: '',
      algorithm: 'auto',
      version: '11.8.1'
    };
  }

  public analyzeAST(ast: ProgramNode): DeobfuscationContext {
    // Reset context
    this.handlers.clear();
    this.constants = [];

    // Step 1: Extract VM handlers
    this.extractVMHandlers(ast);

    // Step 2: Find encryption information
    this.findEncryptionInfo(ast);

    // Step 3: Extract and decrypt constants
    this.extractConstants(ast);

    // Step 4: Map VM operations to Lua opcodes
    this.mapVMOperations();

    return {
      vmContext: this.vmContext,
      extractedInstructions: [],
      decryptedConstants: this.constants,
      reconstructedProto: this.createEmptyProto()
    };
  }

  private extractVMHandlers(node: ASTNode): void {
    if (node.type === 'FunctionDeclaration') {
      const func = node as FunctionDeclarationNode;
      if (func.isVMHandler && func.handlerIndex !== undefined) {
        const handler: LuraphVMHandler = {
          index: func.handlerIndex,
          opcode: this.guessOpcodeFromHandler(func),
          handler: this.extractHandlerCode(func),
          encrypted: this.isHandlerEncrypted(func)
        };

        this.handlers.set(func.handlerIndex, handler);
        this.vmContext.handlers.set(func.handlerIndex, handler);
      }
    }

    // Recursively process children
    if (node.children) {
      node.children.forEach(child => this.extractVMHandlers(child));
    }

    // Handle specific node types with statements
    if (node.type === 'BlockStatement' && 'statements' in node) {
      (node as any).statements.forEach((stmt: ASTNode) => this.extractVMHandlers(stmt));
    }
  }

  private findEncryptionInfo(node: ASTNode): void {
    // Look for encryption key patterns
    if (node.type === 'AssignmentExpression') {
      const assignment = node as any;
      if (assignment.right && assignment.right.length > 0) {
        const value = assignment.right[0];
        if (value.type === 'Literal' && typeof value.value === 'string') {
          // Check if this looks like an encryption key
          if (this.isEncryptionKey(value.value)) {
            this.encryptionKey = value.value;
            this.vmContext.encryptionKey = value.value;
            this.encryptionInfo.key = value.value;
          }
        }
      }
    }

    // Look for encrypted string patterns
    if (node.type === 'EncryptedString') {
      const encryptedNode = node as EncryptedStringNode;
      if (encryptedNode.encryptionMethod) {
        this.encryptionInfo.method = encryptedNode.encryptionMethod;
      }
    }

    // Recursively search
    if (node.children) {
      node.children.forEach(child => this.findEncryptionInfo(child));
    }

    if (node.type === 'BlockStatement' && 'statements' in node) {
      (node as any).statements.forEach((stmt: ASTNode) => this.findEncryptionInfo(stmt));
    }
  }

  private extractConstants(node: ASTNode): void {
    if (node.type === 'TableConstructor') {
      const table = node as any;
      if (table.isConstantTable) {
        // Extract constants from the table
        table.fields.forEach((field: any, index: number) => {
          if (field.value.type === 'Literal') {
            this.constants.push({
              type: this.mapLiteralType(field.value.dataType),
              value: field.value.value,
              index
            });
          } else if (field.value.type === 'EncryptedString') {
            const encryptedNode = field.value as EncryptedStringNode;
            const decryptionResult = this.decryptor.decryptString(encryptedNode.encryptedValue, this.encryptionInfo);
            this.constants.push({
              type: 'string',
              value: decryptionResult.success ? decryptionResult.decrypted : encryptedNode.encryptedValue,
              index
            });
          }
        });
      }
    }

    // Recursively process
    if (node.children) {
      node.children.forEach(child => this.extractConstants(child));
    }

    if (node.type === 'BlockStatement' && 'statements' in node) {
      (node as any).statements.forEach((stmt: ASTNode) => this.extractConstants(stmt));
    }
  }

  private mapVMOperations(): void {
    // Map detected VM handlers to Lua opcodes using symbolic execution
    this.handlers.forEach((handler, index) => {
      // Decrypt handler if needed
      if (handler.encrypted) {
        const decryptionResult = this.decryptor.decryptString(handler.handler, this.encryptionInfo);
        if (decryptionResult.success) {
          handler.decrypted = decryptionResult.decrypted;
        }
      }
      
      // Use symbolic execution to determine the actual opcode
      const analysisResult = this.symbolicExecutor.analyzeHandlerPattern(handler as any);
      handler.opcode = analysisResult.likelyOpcode;
    });
  }

  private guessOpcodeFromHandler(func: FunctionDeclarationNode): number {
    const name = func.name.name.toLowerCase();
    
    // Common Luraph handler naming patterns
    if (name.includes('move') || name.includes('copy')) return LuaOpcode.MOVE;
    if (name.includes('load') && name.includes('const')) return LuaOpcode.LOADK;
    if (name.includes('load') && name.includes('bool')) return LuaOpcode.LOADBOOL;
    if (name.includes('load') && name.includes('nil')) return LuaOpcode.LOADNIL;
    if (name.includes('call')) return LuaOpcode.CALL;
    if (name.includes('return')) return LuaOpcode.RETURN;
    if (name.includes('jump') || name.includes('jmp')) return LuaOpcode.JMP;
    if (name.includes('add')) return LuaOpcode.ADD;
    if (name.includes('sub')) return LuaOpcode.SUB;
    if (name.includes('mul')) return LuaOpcode.MUL;
    if (name.includes('div')) return LuaOpcode.DIV;
    if (name.includes('mod')) return LuaOpcode.MOD;
    if (name.includes('pow')) return LuaOpcode.POW;
    if (name.includes('concat')) return LuaOpcode.CONCAT;
    if (name.includes('table')) return LuaOpcode.NEWTABLE;
    if (name.includes('get') && name.includes('table')) return LuaOpcode.GETTABLE;
    if (name.includes('set') && name.includes('table')) return LuaOpcode.SETTABLE;
    
    // Try to analyze the function body for patterns
    return this.analyzeHandlerBody(func);
  }

  private analyzeHandlerBody(func: FunctionDeclarationNode): number {
    // Analyze the function body to determine the opcode
    const statements = func.body.statements;
    
    for (const stmt of statements) {
      if (stmt.type === 'AssignmentExpression') {
        const assignment = stmt as any;
        const left = assignment.left[0];
        const right = assignment.right[0];
        
        if (left && right) {
          // Pattern: R[A] = R[B] (MOVE)
          if (this.isRegisterAccess(left) && this.isRegisterAccess(right)) {
            return LuaOpcode.MOVE;
          }
          
          // Pattern: R[A] = K[B] (LOADK)
          if (this.isRegisterAccess(left) && this.isConstantAccess(right)) {
            return LuaOpcode.LOADK;
          }
          
          // Pattern: R[A] = R[B] + R[C] (ADD)
          if (right.type === 'BinaryExpression' && right.operator === '+') {
            return LuaOpcode.ADD;
          }
          
          // More patterns...
        }
      }
    }
    
    return 0; // Default to MOVE if unknown
  }

  private extractHandlerCode(func: FunctionDeclarationNode): string {
    // Extract the handler function as a string
    // This is a simplified version - in practice, you'd want to serialize the AST
    return `function ${func.name.name}(...) /* handler code */ end`;
  }

  private isHandlerEncrypted(func: FunctionDeclarationNode): boolean {
    // Check if the handler contains encrypted strings or obfuscated patterns
    return this.containsEncryptedContent(func.body);
  }

  private containsEncryptedContent(node: ASTNode): boolean {
    if (node.type === 'EncryptedString') return true;
    if (node.type === 'Identifier' && (node as any).isObfuscated) return true;
    
    if (node.children) {
      return node.children.some(child => this.containsEncryptedContent(child));
    }
    
    if (node.type === 'BlockStatement' && 'statements' in node) {
      return (node as any).statements.some((stmt: ASTNode) => this.containsEncryptedContent(stmt));
    }
    
    return false;
  }

  private isEncryptionKey(value: string): boolean {
    // Heuristics to identify encryption keys
    return (
      value.length >= 16 && // Minimum key length
      /^[a-zA-Z0-9+/=]+$/.test(value) // Base64-like pattern
    ) || (
      value.length >= 32 && // Hex key
      /^[a-fA-F0-9]+$/.test(value)
    );
  }

  private mapLiteralType(dataType: string): 'nil' | 'boolean' | 'number' | 'string' {
    switch (dataType) {
      case 'nil': return 'nil';
      case 'boolean': return 'boolean';
      case 'number': return 'number';
      case 'string': return 'string';
      default: return 'nil';
    }
  }

  // Method to reconstruct bytecode from VM handlers
  public reconstructBytecode(): VMProto {
    const reconstructionContext: ReconstructionContext = {
      handlers: this.handlers,
      constants: this.constants,
      encryptionInfo: this.encryptionInfo,
      vmVersion: this.vmContext.vmVersion,
      instructionMapping: new Map()
    };

    const result = this.bytecodeReconstructor.reconstructFromVM(reconstructionContext);
    
    if (result.success) {
      return result.proto;
    } else {
      console.error('Bytecode reconstruction failed:', result.statistics.errors);
      return this.createEmptyProto();
    }
  }

  // Enhanced VM detection with better pattern matching
  public detectLuraphVersion(ast: ProgramNode): string {
    const versionPatterns = [
      { pattern: /luraph.*11\.8\.1/i, version: '11.8.1' },
      { pattern: /luraph.*11\.8/i, version: '11.8' },
      { pattern: /luraph.*11\.7/i, version: '11.7' },
      { pattern: /luraph.*11\.6/i, version: '11.6' },
      { pattern: /luraph.*11\.5/i, version: '11.5' }
    ];

    const codeString = this.astToString(ast);
    
    for (const { pattern, version } of versionPatterns) {
      if (pattern.test(codeString)) {
        return version;
      }
    }

    // Default to latest supported version
    return '11.8.1';
  }

  private astToString(node: ASTNode): string {
    // Convert AST to string for pattern matching
    // This is a simplified implementation
    if (node.type === 'Literal') {
      return (node as any).value?.toString() || '';
    }
    if (node.type === 'Identifier') {
      return (node as any).name || '';
    }
    return '';
  }

  private isRegisterAccess(node: ASTNode): boolean {
    // Check if node represents R[index] access
    if (node.type === 'BinaryExpression') {
      const binary = node as any;
      return binary.operator === '[]' && 
             binary.left.type === 'Identifier' && 
             binary.left.name === 'R';
    }
    return false;
  }

  private isConstantAccess(node: ASTNode): boolean {
    // Check if node represents K[index] access  
    if (node.type === 'BinaryExpression') {
      const binary = node as any;
      return binary.operator === '[]' && 
             binary.left.type === 'Identifier' && 
             binary.left.name === 'K';
    }
    return false;
  }

  private createEmptyProto(): VMProto {
    return {
      instructions: [],
      constants: this.constants,
      upvalues: [],
      protos: [],
      source: '@deobfuscated.lua',
      lineDefined: 0,
      lastLineDefined: 0,
      numParams: 0,
      isVararg: false,
      maxStackSize: 0
    };
  }

  // Public methods for external access
  public getHandlers(): Map<number, LuraphVMHandler> {
    return this.handlers;
  }

  public getConstants(): VMConstant[] {
    return this.constants;
  }

  public getEncryptionKey(): string {
    return this.encryptionKey;
  }

  public isValidLuraphScript(ast: ProgramNode): boolean {
    // Check if the AST contains Luraph-specific patterns
    let hasVMHandlers = false;
    let hasEncryptedContent = false;
    let hasObfuscatedNames = false;

    const checkNode = (node: ASTNode): void => {
      if (node.type === 'FunctionDeclaration' && (node as any).isVMHandler) {
        hasVMHandlers = true;
      }
      if (node.type === 'EncryptedString') {
        hasEncryptedContent = true;
      }
      if (node.type === 'Identifier' && (node as any).isObfuscated) {
        hasObfuscatedNames = true;
      }

      if (node.children) {
        node.children.forEach(checkNode);
      }
      if (node.type === 'BlockStatement' && 'statements' in node) {
        (node as any).statements.forEach(checkNode);
      }
    };

    checkNode(ast);

    // Require at least 2 of 3 indicators for positive identification
    const indicators = [hasVMHandlers, hasEncryptedContent, hasObfuscatedNames];
    return indicators.filter(Boolean).length >= 2;
  }
}
