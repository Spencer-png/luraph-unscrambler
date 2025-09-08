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
      
      // More aggressive VM handler detection
      const isVMHandler = func.isVMHandler || 
                         this.detectVMHandlerPattern(func) ||
                         this.hasVMOperations(func.body);
      
      if (isVMHandler) {
        const handlerIndex = func.handlerIndex || this.extractHandlerIndexFromName(func.name.name);
        const handler: LuraphVMHandler = {
          index: handlerIndex,
          opcode: this.guessOpcodeFromHandler(func),
          handler: this.extractHandlerCode(func),
          encrypted: this.isHandlerEncrypted(func)
        };

        this.handlers.set(handlerIndex, handler);
        this.vmContext.handlers.set(handlerIndex, handler);
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

  private detectVMHandlerPattern(func: FunctionDeclarationNode): boolean {
    const name = func.name.name.toLowerCase();
    
    // Check for VM handler naming patterns
    const vmPatterns = [
      /handler_\d+/,
      /vm_\w+/,
      /op_\w+/,
      /exec_\w+/,
      /[a-zA-Z_][a-zA-Z0-9_]{15,}/, // Very long names
      /^[a-zA-Z_][a-zA-Z0-9_]{8,}$/ // Medium-long names
    ];
    
    return vmPatterns.some(pattern => pattern.test(name));
  }

  private extractHandlerIndexFromName(name: string): number {
    // Try to extract index from function name
    const match = name.match(/(\d+)/);
    if (match) {
      return parseInt(match[1]);
    }
    
    // Use hash of name as index if no number found
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = ((hash << 5) - hash + name.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash) % 1000;
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
    let result = '';
    
    const traverse = (n: ASTNode): void => {
      if (n.type === 'Literal') {
        result += (n as any).value?.toString() || '';
      } else if (n.type === 'Identifier') {
        result += (n as any).name || '';
      } else if (n.type === 'FunctionDeclaration') {
        const func = n as any;
        result += `function ${func.name?.name || ''}`;
      } else if (n.type === 'AssignmentExpression') {
        const assignment = n as any;
        result += 'assignment';
      } else if (n.type === 'CallExpression') {
        const call = n as any;
        result += `call ${call.callee?.name || ''}`;
      } else if (n.type === 'BinaryExpression') {
        const binary = n as any;
        result += `binary ${binary.operator || ''}`;
      } else if (n.type === 'BlockStatement') {
        const block = n as any;
        if (block.statements) {
          block.statements.forEach(traverse);
        }
      }
      
      // Recursively traverse children
      if (n.children) {
        n.children.forEach(traverse);
      }
    };
    
    traverse(node);
    return result;
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
    // Convert AST to string for pattern matching
    const codeString = this.astToString(ast);
    
    // Check for Luraph-specific patterns in the code
    const luraphPatterns = [
      /luraph/i,                    // Luraph mentions
      /protected using Luraph/i,    // Protection notice
      /lura\.ph/i,                  // Luraph website
      /obfuscator/i,                // Obfuscator mentions
      /0x[0-9a-fA-F]+/g,           // Hex values (common in obfuscated code)
      /local\s+[a-zA-Z_][a-zA-Z0-9_]{20,}/, // Very long variable names
      /function\s+[a-zA-Z_][a-zA-Z0-9_]{15,}/, // Long function names
      /R\[.*?\]/g,                 // Register access patterns
      /K\[.*?\]/g,                 // Constant access patterns
      /handler_\d+/i,              // Handler function patterns
      /vm_\w+/i,                   // VM function patterns
      /encrypted/i,                // Encryption mentions
      /decrypt/i,                  // Decryption mentions
    ];

    let patternMatches = 0;
    for (const pattern of luraphPatterns) {
      if (pattern.test(codeString)) {
        patternMatches++;
      }
    }

    // Also check AST structure for obfuscation indicators
    let hasObfuscatedStructure = false;
    let hasComplexExpressions = false;
    let hasLongIdentifiers = false;

    const checkNode = (node: ASTNode): void => {
      // Check for obfuscated identifiers
      if (node.type === 'Identifier') {
        const identifier = node as any;
        if (identifier.name && identifier.name.length > 15) {
          hasLongIdentifiers = true;
        }
      }

      // Check for complex expressions (common in obfuscated code)
      if (node.type === 'BinaryExpression') {
        hasComplexExpressions = true;
      }

      // Check for obfuscated structure
      if (node.type === 'FunctionDeclaration') {
        const func = node as any;
        if (func.name && func.name.name && func.name.name.length > 10) {
          hasObfuscatedStructure = true;
        }
      }

      // Recursively check children
      if (node.children) {
        node.children.forEach(checkNode);
      }
      if (node.type === 'BlockStatement' && 'statements' in node) {
        (node as any).statements.forEach(checkNode);
      }
    };

    checkNode(ast);

    // More lenient detection - if we find any Luraph patterns or obfuscation indicators
    const hasLuraphPatterns = patternMatches >= 2;
    const hasObfuscationIndicators = hasObfuscatedStructure || hasComplexExpressions || hasLongIdentifiers;
    
    // Accept if we have Luraph patterns OR obfuscation indicators
    return hasLuraphPatterns || hasObfuscationIndicators;
  }
}
