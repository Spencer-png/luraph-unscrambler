import { ProgramNode, ASTNode, VMHandlerNode, EncryptedStringNode, ConstantTableNode, FunctionDeclarationNode, CallExpressionNode } from './types/ASTNodes';
import { LuraphVMContext, LuraphVMHandler, VMConstant, VMProto, LuaOpcode, DeobfuscationContext } from './types/VMInstructions';

export class LuraphVM {
  private vmContext: LuraphVMContext;
  private handlers: Map<number, LuraphVMHandler> = new Map();
  private constants: VMConstant[] = [];
  private encryptionKey: string = '';

  constructor() {
    this.vmContext = {
      handlers: new Map(),
      constants: [],
      vmVersion: '11.8.1'
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
          }
        }
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
            const decrypted = this.decryptString(field.value.encryptedValue);
            this.constants.push({
              type: 'string',
              value: decrypted,
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
    // Map detected VM handlers to Lua opcodes
    this.handlers.forEach((handler, index) => {
      const mappedOpcode = this.mapHandlerToOpcode(handler);
      handler.opcode = mappedOpcode;
      
      // Decrypt handler if needed
      if (handler.encrypted) {
        handler.decrypted = this.decryptHandler(handler.handler);
      }
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

  private decryptString(encrypted: string): string {
    if (!this.encryptionKey) {
      return encrypted; // Return as-is if no key found
    }

    // Implement actual decryption based on Luraph's methods
    // This is a simplified version - real implementation would use the actual algorithm
    try {
      return this.xorDecrypt(encrypted, this.encryptionKey);
    } catch (error) {
      console.warn('Failed to decrypt string:', error);
      return encrypted;
    }
  }

  private xorDecrypt(encrypted: string, key: string): string {
    // Simple XOR decryption - replace with actual Luraph algorithm
    let result = '';
    for (let i = 0; i < encrypted.length; i++) {
      const charCode = encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return result;
  }

  private mapHandlerToOpcode(handler: LuraphVMHandler): number {
    // Use pattern matching to determine the actual Lua opcode
    const patterns = [
      { pattern: /R\[\w+\]\s*=\s*R\[\w+\]/, opcode: LuaOpcode.MOVE },
      { pattern: /R\[\w+\]\s*=\s*K\[\w+\]/, opcode: LuaOpcode.LOADK },
      { pattern: /R\[\w+\]\s*=\s*.*\+.*/, opcode: LuaOpcode.ADD },
      { pattern: /R\[\w+\]\s*=\s*.*-.*/, opcode: LuaOpcode.SUB },
      { pattern: /R\[\w+\]\s*=\s*.*\*.*/, opcode: LuaOpcode.MUL },
      { pattern: /R\[\w+\]\s*=\s*.*\/.*/, opcode: LuaOpcode.DIV },
      { pattern: /R\[\w+\]\(.*\)/, opcode: LuaOpcode.CALL },
      { pattern: /return.*/, opcode: LuaOpcode.RETURN },
    ];

    for (const { pattern, opcode } of patterns) {
      if (pattern.test(handler.handler)) {
        return opcode;
      }
    }

    return handler.opcode; // Keep existing if no pattern matches
  }

  private decryptHandler(handlerCode: string): string {
    // Decrypt the handler code if it's encrypted
    if (!this.encryptionKey) return handlerCode;
    
    try {
      return this.xorDecrypt(handlerCode, this.encryptionKey);
    } catch (error) {
      console.warn('Failed to decrypt handler:', error);
      return handlerCode;
    }
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