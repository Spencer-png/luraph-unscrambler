// VM Instruction types and Lua bytecode definitions
export enum LuaOpcode {
  MOVE = 0,      // MOVE A B     R(A) := R(B)
  LOADK = 1,     // LOADK A Bx   R(A) := Kst(Bx)
  LOADKX = 2,    // LOADKX A     R(A) := Kst(extra arg)
  LOADBOOL = 3,  // LOADBOOL A B C  R(A) := (Bool)B; if (C) pc++
  LOADNIL = 4,   // LOADNIL A B  R(A), R(A+1), ..., R(A+B) := nil
  GETUPVAL = 5,  // GETUPVAL A B R(A) := UpValue[B]
  GETTABUP = 6,  // GETTABUP A B C  R(A) := UpValue[B][RK(C)]
  GETTABLE = 7,  // GETTABLE A B C  R(A) := R(B)[RK(C)]
  SETTABUP = 8,  // SETTABUP A B C  UpValue[A][RK(B)] := RK(C)
  SETUPVAL = 9,  // SETUPVAL A B UpValue[B] := R(A)
  SETTABLE = 10, // SETTABLE A B C  R(A)[RK(B)] := RK(C)
  NEWTABLE = 11, // NEWTABLE A B C  R(A) := {} (size = B,C)
  SELF = 12,     // SELF A B C   R(A+1) := R(B); R(A) := R(B)[RK(C)]
  ADD = 13,      // ADD A B C    R(A) := RK(B) + RK(C)
  SUB = 14,      // SUB A B C    R(A) := RK(B) - RK(C)
  MUL = 15,      // MUL A B C    R(A) := RK(B) * RK(C)
  MOD = 16,      // MOD A B C    R(A) := RK(B) % RK(C)
  POW = 17,      // POW A B C    R(A) := RK(B) ^ RK(C)
  DIV = 18,      // DIV A B C    R(A) := RK(B) / RK(C)
  IDIV = 19,     // IDIV A B C   R(A) := RK(B) // RK(C)
  BAND = 20,     // BAND A B C   R(A) := RK(B) & RK(C)
  BOR = 21,      // BOR A B C    R(A) := RK(B) | RK(C)
  BXOR = 22,     // BXOR A B C   R(A) := RK(B) ~ RK(C)
  SHL = 23,      // SHL A B C    R(A) := RK(B) << RK(C)
  SHR = 24,      // SHR A B C    R(A) := RK(B) >> RK(C)
  UNM = 25,      // UNM A B      R(A) := -R(B)
  BNOT = 26,     // BNOT A B     R(A) := ~R(B)
  NOT = 27,      // NOT A B      R(A) := not R(B)
  LEN = 28,      // LEN A B      R(A) := length of R(B)
  CONCAT = 29,   // CONCAT A B C R(A) := R(B).. ... ..R(C)
  JMP = 30,      // JMP A sBx    pc+=sBx; if (A) close all upvalues >= R(A - 1)
  EQ = 31,       // EQ A B C     if ((RK(B) == RK(C)) ~= A) then pc++
  LT = 32,       // LT A B C     if ((RK(B) <  RK(C)) ~= A) then pc++
  LE = 33,       // LE A B C     if ((RK(B) <= RK(C)) ~= A) then pc++
  TEST = 34,     // TEST A C     if not (R(A) <=> C) then pc++
  TESTSET = 35,  // TESTSET A B C if (R(B) <=> C) then R(A) := R(B) else pc++
  CALL = 36,     // CALL A B C   R(A), ... ,R(A+C-2) := R(A)(R(A+1), ... ,R(A+B-1))
  TAILCALL = 37, // TAILCALL A B return R(A)(R(A+1), ... ,R(A+B-1))
  RETURN = 38,   // RETURN A B   return R(A), ... ,R(A+B-2)
  FORLOOP = 39,  // FORLOOP A sBx R(A)+=R(A+2); if R(A) <?= R(A+1) then { pc+=sBx; R(A+3)=R(A) }
  FORPREP = 40,  // FORPREP A sBx R(A)-=R(A+2); pc+=sBx
  TFORCALL = 41, // TFORCALL A C R(A+3), ... ,R(A+2+C) := R(A)(R(A+1), R(A+2));
  TFORLOOP = 42, // TFORLOOP A sBx if R(A+1) ~= nil then { R(A)=R(A+1); pc += sBx }
  SETLIST = 43,  // SETLIST A B C R(A)[(C-1)*FPF+i] := R(A+i), 1 <= i <= B
  CLOSURE = 44,  // CLOSURE A Bx R(A) := closure(KPROTO[Bx])
  VARARG = 45,   // VARARG A B   R(A), R(A+1), ..., R(A+B-2) = vararg
  EXTRAARG = 46, // EXTRAARG Ax  extra (larger) argument for previous opcode
}

export interface VMInstruction {
  opcode: LuaOpcode;
  a: number;       // Register A
  b: number;       // Register/constant B
  c: number;       // Register/constant C
  bx?: number;     // Extended B operand
  sbx?: number;    // Signed extended B operand
  ax?: number;     // Extended A operand
  line?: number;   // Source line number
}

export interface VMConstant {
  type: 'nil' | 'boolean' | 'number' | 'string';
  value: any;
  index: number;
}

export interface VMUpvalue {
  name: string;
  index: number;
  isLocal: boolean;
  register: number;
}

export interface VMProto {
  instructions: VMInstruction[];
  constants: VMConstant[];
  upvalues: VMUpvalue[];
  protos: VMProto[];
  source: string;
  lineDefined: number;
  lastLineDefined: number;
  numParams: number;
  isVararg: boolean;
  maxStackSize: number;
}

// Luraph VM specific structures
export interface LuraphVMHandler {
  index: number;
  opcode: number;
  handler: string;
  encrypted: boolean;
  decrypted?: string;
}

export interface LuraphVMContext {
  handlers: Map<number, LuraphVMHandler>;
  constants: VMConstant[];
  encryptionKey?: string;
  vmVersion: string;
}

export interface LuraphInstruction {
  originalOpcode: LuaOpcode;
  handlerIndex: number;
  operands: number[];
  isEncrypted: boolean;
  decryptedOperands?: number[];
}

// Pattern matching for VM handlers
export interface VMHandlerPattern {
  signature: string;
  opcode: LuaOpcode;
  pattern: RegExp;
  extractOperands: (match: RegExpMatchArray) => number[];
}

export const VM_HANDLER_PATTERNS: VMHandlerPattern[] = [
  {
    signature: 'move_handler',
    opcode: LuaOpcode.MOVE,
    pattern: /R\[(\d+)\]\s*=\s*R\[(\d+)\]/,
    extractOperands: (match) => [parseInt(match[1]), parseInt(match[2]), 0]
  },
  {
    signature: 'loadk_handler',
    opcode: LuaOpcode.LOADK,
    pattern: /R\[(\d+)\]\s*=\s*K\[(\d+)\]/,
    extractOperands: (match) => [parseInt(match[1]), parseInt(match[2]), 0]
  },
  {
    signature: 'call_handler',
    opcode: LuaOpcode.CALL,
    pattern: /R\[(\d+)\]\(.*?\)/,
    extractOperands: (match) => [parseInt(match[1]), 0, 0]
  }
];

export interface DeobfuscationContext {
  vmContext: LuraphVMContext;
  extractedInstructions: LuraphInstruction[];
  decryptedConstants: VMConstant[];
  reconstructedProto: VMProto;
}