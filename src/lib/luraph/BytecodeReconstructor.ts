import { VMProto, VMInstruction, VMConstant, LuaOpcode, LuraphVMHandler, LuraphInstruction } from './types/VMInstructions';
import { SymbolicExecutor, ExecutionResult } from './SymbolicExecutor';
import { LuraphDecryptor, EncryptionInfo } from './LuraphDecryptor';

export interface ReconstructionContext {
  handlers: Map<number, LuraphVMHandler>;
  constants: VMConstant[];
  encryptionInfo: EncryptionInfo;
  vmVersion: string;
  instructionMapping: Map<number, number>;
}

export interface ReconstructionResult {
  success: boolean;
  proto: VMProto;
  statistics: {
    handlersProcessed: number;
    instructionsReconstructed: number;
    constantsDecrypted: number;
    errors: string[];
  };
}

export class BytecodeReconstructor {
  private symbolicExecutor: SymbolicExecutor;
  private decryptor: LuraphDecryptor;
  private context: ReconstructionContext;

  constructor() {
    this.symbolicExecutor = new SymbolicExecutor();
    this.decryptor = new LuraphDecryptor();
    this.context = {
      handlers: new Map(),
      constants: [],
      encryptionInfo: { method: 'auto', key: '', algorithm: 'auto', version: 'auto' },
      vmVersion: '11.8.1',
      instructionMapping: new Map()
    };
  }

  public reconstructFromVM(context: ReconstructionContext): ReconstructionResult {
    this.context = context;
    
    const statistics = {
      handlersProcessed: 0,
      instructionsReconstructed: 0,
      constantsDecrypted: 0,
      errors: [] as string[]
    };

    try {
      // Step 1: Decrypt constants
      const decryptedConstants = this.decryptConstants(context.constants, context.encryptionInfo);
      statistics.constantsDecrypted = decryptedConstants.length;

      // Step 2: Process VM handlers
      const instructions: VMInstruction[] = [];
      const handlerArray = Array.from(context.handlers.entries())
        .sort(([a], [b]) => a - b);

      for (const [index, handler] of handlerArray) {
        try {
          const reconstructedInstruction = this.reconstructHandler(handler, context);
          if (reconstructedInstruction) {
            instructions.push(reconstructedInstruction);
            statistics.instructionsReconstructed++;
          }
          statistics.handlersProcessed++;
        } catch (error) {
          const errorMsg = `Failed to reconstruct handler ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          statistics.errors.push(errorMsg);
          console.warn(errorMsg);
        }
      }

      // Step 3: Create VM prototype
      const proto: VMProto = {
        instructions,
        constants: decryptedConstants,
        upvalues: [],
        protos: [],
        source: '@deobfuscated.lua',
        lineDefined: 0,
        lastLineDefined: instructions.length,
        numParams: 0,
        isVararg: false,
        maxStackSize: this.calculateMaxStackSize(instructions)
      };

      // Step 4: Optimize the reconstructed bytecode
      this.optimizeReconstructedBytecode(proto);

      return {
        success: true,
        proto,
        statistics
      };

    } catch (error) {
      return {
        success: false,
        proto: this.createEmptyProto(),
        statistics: {
          ...statistics,
          errors: [...statistics.errors, error instanceof Error ? error.message : 'Reconstruction failed']
        }
      };
    }
  }

  private decryptConstants(constants: VMConstant[], encryptionInfo: EncryptionInfo): VMConstant[] {
    const decryptedConstants: VMConstant[] = [];

    for (let i = 0; i < constants.length; i++) {
      const constant = constants[i];
      
      if (constant.type === 'string' && typeof constant.value === 'string') {
        // Try to decrypt the string constant
        const decryptionResult = this.decryptor.decryptString(constant.value, encryptionInfo);
        
        if (decryptionResult.success) {
          decryptedConstants.push({
            ...constant,
            value: decryptionResult.decrypted,
            index: i
          });
        } else {
          // Keep original if decryption fails
          decryptedConstants.push(constant);
        }
      } else {
        decryptedConstants.push(constant);
      }
    }

    return decryptedConstants;
  }

  private reconstructHandler(handler: LuraphVMHandler, context: ReconstructionContext): VMInstruction | null {
    try {
      // Step 1: Decrypt handler if needed
      let handlerCode = handler.handler;
      if (handler.encrypted && handler.decrypted) {
        handlerCode = handler.decrypted;
      } else if (handler.encrypted) {
        const decryptionResult = this.decryptor.decryptString(handler.handler, context.encryptionInfo);
        if (decryptionResult.success) {
          handlerCode = decryptionResult.decrypted;
        }
      }

      // Step 2: Use symbolic execution to analyze the handler
      const executionResult = this.analyzeHandlerWithSymbolicExecution(handler, handlerCode, context);
      
      if (executionResult.isComplete) {
        return {
          opcode: executionResult.opcode,
          a: executionResult.operands[0] || 0,
          b: executionResult.operands[1] || 0,
          c: executionResult.operands[2] || 0,
          line: handler.index
        };
      }

      // Step 3: Fallback to pattern matching
      return this.reconstructFromPatterns(handler, handlerCode);

    } catch (error) {
      console.warn(`Failed to reconstruct handler ${handler.index}:`, error);
      return null;
    }
  }

  private analyzeHandlerWithSymbolicExecution(
    handler: LuraphVMHandler, 
    handlerCode: string, 
    context: ReconstructionContext
  ): ExecutionResult {
    // Create a mock function declaration for symbolic execution
    // In a real implementation, you would parse the handler code into an AST
    const mockFunction = this.createMockFunctionFromHandler(handler, handlerCode);
    
    // Execute symbolically
    return this.symbolicExecutor.executeVMHandler(mockFunction, context);
  }

  private createMockFunctionFromHandler(handler: LuraphVMHandler, handlerCode: string): any {
    // This is a simplified mock - in reality you'd parse the handler code
    return {
      type: 'FunctionDeclaration',
      name: { name: `handler_${handler.index}` },
      parameters: [],
      body: {
        type: 'BlockStatement',
        statements: this.parseHandlerCode(handlerCode)
      }
    };
  }

  private parseHandlerCode(handlerCode: string): any[] {
    // Simplified parser for handler code
    // In reality, you'd use a proper Lua parser
    const statements: any[] = [];
    
    // Look for common patterns in handler code
    const patterns = [
      { regex: /R\[(\d+)\]\s*=\s*R\[(\d+)\]/, type: 'MOVE' },
      { regex: /R\[(\d+)\]\s*=\s*K\[(\d+)\]/, type: 'LOADK' },
      { regex: /R\[(\d+)\]\s*=\s*R\[(\d+)\]\s*\+\s*R\[(\d+)\]/, type: 'ADD' },
      { regex: /R\[(\d+)\]\s*=\s*R\[(\d+)\]\s*-\s*R\[(\d+)\]/, type: 'SUB' },
      { regex: /R\[(\d+)\]\(/, type: 'CALL' },
      { regex: /return/, type: 'RETURN' }
    ];

    for (const pattern of patterns) {
      const match = handlerCode.match(pattern.regex);
      if (match) {
        statements.push({
          type: 'AssignmentExpression',
          left: [{ type: 'BinaryExpression', operator: '[]', left: { name: 'R' }, right: { value: parseInt(match[1]) } }],
          right: [{ type: 'BinaryExpression', operator: '[]', left: { name: 'R' }, right: { value: parseInt(match[2]) } }]
        });
        break; // Use first match
      }
    }

    return statements;
  }

  private reconstructFromPatterns(handler: LuraphVMHandler, handlerCode: string): VMInstruction | null {
    // Pattern-based reconstruction as fallback
    const patterns = [
      {
        regex: /R\[(\d+)\]\s*=\s*R\[(\d+)\]/,
        opcode: LuaOpcode.MOVE,
        extractOperands: (match: RegExpMatchArray) => [parseInt(match[1]), parseInt(match[2]), 0]
      },
      {
        regex: /R\[(\d+)\]\s*=\s*K\[(\d+)\]/,
        opcode: LuaOpcode.LOADK,
        extractOperands: (match: RegExpMatchArray) => [parseInt(match[1]), parseInt(match[2]), 0]
      },
      {
        regex: /R\[(\d+)\]\s*=\s*R\[(\d+)\]\s*\+\s*R\[(\d+)\]/,
        opcode: LuaOpcode.ADD,
        extractOperands: (match: RegExpMatchArray) => [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
      },
      {
        regex: /R\[(\d+)\]\s*=\s*R\[(\d+)\]\s*-\s*R\[(\d+)\]/,
        opcode: LuaOpcode.SUB,
        extractOperands: (match: RegExpMatchArray) => [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])]
      },
      {
        regex: /R\[(\d+)\]\(/,
        opcode: LuaOpcode.CALL,
        extractOperands: (match: RegExpMatchArray) => [parseInt(match[1]), 1, 1]
      },
      {
        regex: /return/,
        opcode: LuaOpcode.RETURN,
        extractOperands: () => [0, 1, 0]
      }
    ];

    for (const pattern of patterns) {
      const match = handlerCode.match(pattern.regex);
      if (match) {
        const operands = pattern.extractOperands(match);
        return {
          opcode: pattern.opcode,
          a: operands[0],
          b: operands[1],
          c: operands[2],
          line: handler.index
        };
      }
    }

    // Default fallback
    return {
      opcode: LuaOpcode.MOVE,
      a: 0,
      b: 0,
      c: 0,
      line: handler.index
    };
  }

  private calculateMaxStackSize(instructions: VMInstruction[]): number {
    let maxStack = 0;
    let currentStack = 0;

    for (const instruction of instructions) {
      switch (instruction.opcode) {
        case LuaOpcode.LOADK:
        case LuaOpcode.LOADBOOL:
        case LuaOpcode.LOADNIL:
        case LuaOpcode.MOVE:
          currentStack = Math.max(currentStack, instruction.a + 1);
          break;
        case LuaOpcode.CALL:
          if (instruction.b > 0) {
            currentStack = Math.max(currentStack, instruction.a + instruction.b);
          }
          if (instruction.c > 0) {
            currentStack = Math.max(currentStack, instruction.a + instruction.c - 1);
          }
          break;
        case LuaOpcode.NEWTABLE:
          currentStack = Math.max(currentStack, instruction.a + 1);
          break;
        case LuaOpcode.ADD:
        case LuaOpcode.SUB:
        case LuaOpcode.MUL:
        case LuaOpcode.DIV:
        case LuaOpcode.MOD:
        case LuaOpcode.POW:
          currentStack = Math.max(currentStack, instruction.a + 1);
          break;
      }
      
      maxStack = Math.max(maxStack, currentStack);
    }

    return Math.max(maxStack, 2); // Minimum stack size
  }

  private optimizeReconstructedBytecode(proto: VMProto): void {
    // Remove redundant instructions
    proto.instructions = this.removeRedundantInstructions(proto.instructions);
    
    // Optimize constant loading
    this.optimizeConstantLoading(proto);
    
    // Remove dead code
    this.removeDeadCode(proto);
    
    // Optimize register usage
    this.optimizeRegisterUsage(proto);
  }

  private removeRedundantInstructions(instructions: VMInstruction[]): VMInstruction[] {
    const optimized: VMInstruction[] = [];
    
    for (let i = 0; i < instructions.length; i++) {
      const current = instructions[i];
      const next = instructions[i + 1];
      
      // Remove redundant MOVE instructions (MOVE A A)
      if (current.opcode === LuaOpcode.MOVE && current.a === current.b) {
        continue;
      }
      
      // Remove LOADK followed by unused register
      if (current.opcode === LuaOpcode.LOADK && next && 
          next.opcode === LuaOpcode.LOADK && next.a === current.a) {
        continue;
      }
      
      // Remove redundant arithmetic operations
      if (this.isRedundantArithmetic(current, next)) {
        continue;
      }
      
      optimized.push(current);
    }
    
    return optimized;
  }

  private isRedundantArithmetic(current: VMInstruction, next: VMInstruction): boolean {
    // Check for redundant arithmetic operations
    if (!next) return false;
    
    const arithmeticOps = [LuaOpcode.ADD, LuaOpcode.SUB, LuaOpcode.MUL, LuaOpcode.DIV];
    
    if (arithmeticOps.includes(current.opcode) && arithmeticOps.includes(next.opcode)) {
      // Check if they're operating on the same registers
      return current.a === next.a && current.b === next.b && current.c === next.c;
    }
    
    return false;
  }

  private optimizeConstantLoading(proto: VMProto): void {
    // Remove duplicate constants
    const uniqueConstants = new Map<string, number>();
    const constantMapping = new Map<number, number>();
    
    proto.constants.forEach((constant, index) => {
      const key = `${constant.type}:${JSON.stringify(constant.value)}`;
      if (uniqueConstants.has(key)) {
        constantMapping.set(index, uniqueConstants.get(key)!);
      } else {
        const newIndex = uniqueConstants.size;
        uniqueConstants.set(key, newIndex);
        constantMapping.set(index, newIndex);
      }
    });

    // Update constant references in instructions
    proto.instructions.forEach(instruction => {
      if (instruction.opcode === LuaOpcode.LOADK && instruction.bx !== undefined) {
        instruction.bx = constantMapping.get(instruction.bx) || instruction.bx;
      }
    });

    // Rebuild constants array
    proto.constants = Array.from(uniqueConstants.entries()).map(([key, index]) => {
      const [type, value] = key.split(':');
      return {
        type: type as any,
        value: type === 'number' ? parseFloat(value) : JSON.parse(value),
        index
      };
    });
  }

  private removeDeadCode(proto: VMProto): void {
    // Simple dead code elimination
    const reachable = new Set<number>();
    const worklist = [0]; // Start from first instruction
    
    while (worklist.length > 0) {
      const pc = worklist.pop()!;
      if (reachable.has(pc) || pc >= proto.instructions.length) continue;
      
      reachable.add(pc);
      const instruction = proto.instructions[pc];
      
      // Add successors
      switch (instruction.opcode) {
        case LuaOpcode.JMP:
          if (instruction.sbx !== undefined) {
            worklist.push(pc + 1 + instruction.sbx);
          }
          break;
        case LuaOpcode.RETURN:
          // No successors
          break;
        default:
          worklist.push(pc + 1);
          break;
      }
    }
    
    // Filter out unreachable instructions
    proto.instructions = proto.instructions.filter((_, index) => reachable.has(index));
  }

  private optimizeRegisterUsage(proto: VMProto): void {
    // Simple register optimization - reuse registers when possible
    const registerUsage = new Map<number, number>();
    
    proto.instructions.forEach(instruction => {
      // Track register usage
      if (instruction.a !== undefined) {
        registerUsage.set(instruction.a, (registerUsage.get(instruction.a) || 0) + 1);
      }
      if (instruction.b !== undefined && instruction.b < 256) { // Not a constant
        registerUsage.set(instruction.b, (registerUsage.get(instruction.b) || 0) + 1);
      }
      if (instruction.c !== undefined && instruction.c < 256) { // Not a constant
        registerUsage.set(instruction.c, (registerUsage.get(instruction.c) || 0) + 1);
      }
    });
    
    // Update max stack size based on actual register usage
    const maxUsedRegister = Math.max(...Array.from(registerUsage.keys()), 0);
    proto.maxStackSize = Math.max(maxUsedRegister + 1, proto.maxStackSize);
  }

  private createEmptyProto(): VMProto {
    return {
      instructions: [],
      constants: [],
      upvalues: [],
      protos: [],
      source: '@deobfuscated.lua',
      lineDefined: 0,
      lastLineDefined: 0,
      numParams: 0,
      isVararg: false,
      maxStackSize: 2
    };
  }
}
