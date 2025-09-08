// Lua token types for lexical analysis
export enum LuaTokenType {
  // Literals
  NUMBER = 'NUMBER',
  STRING = 'STRING',
  BOOLEAN = 'BOOLEAN',
  NIL = 'NIL',
  
  // Identifiers
  IDENTIFIER = 'IDENTIFIER',
  
  // Keywords
  AND = 'AND',
  BREAK = 'BREAK',
  DO = 'DO',
  ELSE = 'ELSE',
  ELSEIF = 'ELSEIF',
  END = 'END',
  FALSE = 'FALSE',
  FOR = 'FOR',
  FUNCTION = 'FUNCTION',
  IF = 'IF',
  IN = 'IN',
  LOCAL = 'LOCAL',
  NOT = 'NOT',
  OR = 'OR',
  REPEAT = 'REPEAT',
  RETURN = 'RETURN',
  THEN = 'THEN',
  TRUE = 'TRUE',
  UNTIL = 'UNTIL',
  WHILE = 'WHILE',
  
  // Operators
  PLUS = 'PLUS',
  MINUS = 'MINUS',
  MULTIPLY = 'MULTIPLY',
  DIVIDE = 'DIVIDE',
  MODULO = 'MODULO',
  POWER = 'POWER',
  CONCAT = 'CONCAT',
  LENGTH = 'LENGTH',
  EQUAL = 'EQUAL',
  NOT_EQUAL = 'NOT_EQUAL',
  LESS_THAN = 'LESS_THAN',
  LESS_EQUAL = 'LESS_EQUAL',
  GREATER_THAN = 'GREATER_THAN',
  GREATER_EQUAL = 'GREATER_EQUAL',
  ASSIGN = 'ASSIGN',
  
  // Delimiters
  SEMICOLON = 'SEMICOLON',
  COMMA = 'COMMA',
  DOT = 'DOT',
  COLON = 'COLON',
  DOUBLE_COLON = 'DOUBLE_COLON',
  LPAREN = 'LPAREN',
  RPAREN = 'RPAREN',
  LBRACE = 'LBRACE',
  RBRACE = 'RBRACE',
  LBRACKET = 'LBRACKET',
  RBRACKET = 'RBRACKET',
  
  // Special
  EOF = 'EOF',
  NEWLINE = 'NEWLINE',
  WHITESPACE = 'WHITESPACE',
  COMMENT = 'COMMENT',
  
  // Luraph VM specific
  VM_CALL = 'VM_CALL',
  VM_HANDLER = 'VM_HANDLER',
  ENCRYPTED_STRING = 'ENCRYPTED_STRING',
  OBFUSCATED_NAME = 'OBFUSCATED_NAME',
}

export interface LuaToken {
  type: LuaTokenType;
  value: string;
  line: number;
  column: number;
  position: number;
}

export interface LuaPosition {
  line: number;
  column: number;
  position: number;
}

// Luraph-specific patterns
export interface LuraphPattern {
  id: string;
  pattern: RegExp;
  description: string;
  type: 'vm_call' | 'encryption' | 'handler' | 'constant';
}

export const LURAPH_PATTERNS: LuraphPattern[] = [
  {
    id: 'vm_call_pattern',
    pattern: /[a-zA-Z_][a-zA-Z0-9_]*\s*\(\s*[a-zA-Z_][a-zA-Z0-9_]*\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*\s*,\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\)/,
    description: 'VM function call pattern',
    type: 'vm_call'
  },
  {
    id: 'handler_pattern',
    pattern: /\[\s*(\d+)\s*\]\s*=\s*function\s*\(/,
    description: 'VM handler function definition',
    type: 'handler'
  },
  {
    id: 'encryption_pattern',
    pattern: /(string\.char|string\.byte|string\.sub|bit32\.|bit\.)/,
    description: 'String manipulation for decryption',
    type: 'encryption'
  },
  {
    id: 'constant_pattern',
    pattern: /[a-zA-Z_][a-zA-Z0-9_]*\s*=\s*\{[^}]*\}/,
    description: 'Constant table definition',
    type: 'constant'
  }
];