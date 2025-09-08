import { LuaToken, LuaTokenType, LuaPosition, LURAPH_PATTERNS } from './types/LuaTokens';

export class LuaLexer {
  private input: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: LuaToken[] = [];

  private readonly keywords = new Set([
    'and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for',
    'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat',
    'return', 'then', 'true', 'until', 'while'
  ]);

  constructor(input: string) {
    this.input = input;
  }

  public tokenize(): LuaToken[] {
    this.tokens = [];
    this.position = 0;
    this.line = 1;
    this.column = 1;

    while (this.position < this.input.length) {
      this.skipWhitespace();
      
      if (this.position >= this.input.length) break;

      const token = this.nextToken();
      if (token) {
        this.tokens.push(token);
      }
    }

    this.tokens.push({
      type: LuaTokenType.EOF,
      value: '',
      line: this.line,
      column: this.column,
      position: this.position
    });

    return this.tokens;
  }

  private nextToken(): LuaToken | null {
    const current = this.input[this.position];
    const position = this.createPosition();

    // Comments
    if (current === '-' && this.peek() === '-') {
      return this.readComment();
    }

    // Numbers
    if (this.isDigit(current)) {
      return this.readNumber();
    }

    // Strings
    if (current === '"' || current === "'") {
      return this.readString(current);
    }

    // Long strings
    if (current === '[') {
      const longStringStart = this.checkLongStringStart();
      if (longStringStart >= 0) {
        return this.readLongString(longStringStart);
      }
    }

    // Identifiers and keywords
    if (this.isAlpha(current) || current === '_') {
      return this.readIdentifier();
    }

    // Two-character operators
    const twoChar = this.input.substr(this.position, 2);
    switch (twoChar) {
      case '==': this.advance(2); return this.createToken(LuaTokenType.EQUAL, '==', position);
      case '~=': this.advance(2); return this.createToken(LuaTokenType.NOT_EQUAL, '~=', position);
      case '<=': this.advance(2); return this.createToken(LuaTokenType.LESS_EQUAL, '<=', position);
      case '>=': this.advance(2); return this.createToken(LuaTokenType.GREATER_EQUAL, '>=', position);
      case '..': this.advance(2); return this.createToken(LuaTokenType.CONCAT, '..', position);
      case '::': this.advance(2); return this.createToken(LuaTokenType.DOUBLE_COLON, '::', position);
    }

    // Single-character tokens
    switch (current) {
      case '+': this.advance(); return this.createToken(LuaTokenType.PLUS, '+', position);
      case '-': this.advance(); return this.createToken(LuaTokenType.MINUS, '-', position);
      case '*': this.advance(); return this.createToken(LuaTokenType.MULTIPLY, '*', position);
      case '/': this.advance(); return this.createToken(LuaTokenType.DIVIDE, '/', position);
      case '%': this.advance(); return this.createToken(LuaTokenType.MODULO, '%', position);
      case '^': this.advance(); return this.createToken(LuaTokenType.POWER, '^', position);
      case '#': this.advance(); return this.createToken(LuaTokenType.LENGTH, '#', position);
      case '<': this.advance(); return this.createToken(LuaTokenType.LESS_THAN, '<', position);
      case '>': this.advance(); return this.createToken(LuaTokenType.GREATER_THAN, '>', position);
      case '=': this.advance(); return this.createToken(LuaTokenType.ASSIGN, '=', position);
      case ';': this.advance(); return this.createToken(LuaTokenType.SEMICOLON, ';', position);
      case ',': this.advance(); return this.createToken(LuaTokenType.COMMA, ',', position);
      case '.': this.advance(); return this.createToken(LuaTokenType.DOT, '.', position);
      case ':': this.advance(); return this.createToken(LuaTokenType.COLON, ':', position);
      case '(': this.advance(); return this.createToken(LuaTokenType.LPAREN, '(', position);
      case ')': this.advance(); return this.createToken(LuaTokenType.RPAREN, ')', position);
      case '{': this.advance(); return this.createToken(LuaTokenType.LBRACE, '{', position);
      case '}': this.advance(); return this.createToken(LuaTokenType.RBRACE, '}', position);
      case '[': this.advance(); return this.createToken(LuaTokenType.LBRACKET, '[', position);
      case ']': this.advance(); return this.createToken(LuaTokenType.RBRACKET, ']', position);
      case '\n': this.advance(); return this.createToken(LuaTokenType.NEWLINE, '\n', position);
    }

    // Unknown character
    this.advance();
    return null;
  }

  private readComment(): LuaToken {
    const position = this.createPosition();
    const start = this.position;

    this.advance(2); // Skip '--'

    // Check for long comment
    if (this.input[this.position] === '[') {
      const level = this.checkLongStringStart();
      if (level >= 0) {
        this.readLongString(level);
        return this.createToken(LuaTokenType.COMMENT, this.input.substring(start, this.position), position);
      }
    }

    // Short comment
    while (this.position < this.input.length && this.input[this.position] !== '\n') {
      this.advance();
    }

    return this.createToken(LuaTokenType.COMMENT, this.input.substring(start, this.position), position);
  }

  private readNumber(): LuaToken {
    const position = this.createPosition();
    const start = this.position;

    while (this.position < this.input.length && 
           (this.isDigit(this.input[this.position]) || 
            this.input[this.position] === '.' ||
            this.input[this.position].toLowerCase() === 'e' ||
            this.input[this.position] === '+' ||
            this.input[this.position] === '-')) {
      this.advance();
    }

    return this.createToken(LuaTokenType.NUMBER, this.input.substring(start, this.position), position);
  }

  private readString(quote: string): LuaToken {
    const position = this.createPosition();
    const start = this.position;

    this.advance(); // Skip opening quote

    while (this.position < this.input.length) {
      const current = this.input[this.position];
      
      if (current === quote) {
        this.advance();
        break;
      }
      
      if (current === '\\') {
        this.advance(); // Skip escape character
        if (this.position < this.input.length) {
          this.advance(); // Skip escaped character
        }
      } else {
        this.advance();
      }
    }

    const value = this.input.substring(start, this.position);
    
    // Check if this might be an encrypted string (Luraph pattern)
    if (this.isEncryptedString(value)) {
      return this.createToken(LuaTokenType.ENCRYPTED_STRING, value, position);
    }

    return this.createToken(LuaTokenType.STRING, value, position);
  }

  private readLongString(level: number): LuaToken {
    const position = this.createPosition();
    const start = this.position;
    const openPattern = '[' + '='.repeat(level) + '[';
    const closePattern = ']' + '='.repeat(level) + ']';

    this.advance(openPattern.length); // Skip opening bracket

    while (this.position < this.input.length) {
      if (this.input.substr(this.position, closePattern.length) === closePattern) {
        this.advance(closePattern.length);
        break;
      }
      this.advance();
    }

    return this.createToken(LuaTokenType.STRING, this.input.substring(start, this.position), position);
  }

  private readIdentifier(): LuaToken {
    const position = this.createPosition();
    const start = this.position;

    while (this.position < this.input.length && 
           (this.isAlphaNumeric(this.input[this.position]) || this.input[this.position] === '_')) {
      this.advance();
    }

    const value = this.input.substring(start, this.position);
    
    // Check for keywords
    if (this.keywords.has(value.toLowerCase())) {
      const tokenType = this.getKeywordTokenType(value.toLowerCase());
      return this.createToken(tokenType, value, position);
    }

    // Check if this might be an obfuscated name (Luraph pattern)
    if (this.isObfuscatedName(value)) {
      return this.createToken(LuaTokenType.OBFUSCATED_NAME, value, position);
    }

    return this.createToken(LuaTokenType.IDENTIFIER, value, position);
  }

  private isEncryptedString(value: string): boolean {
    // Detect patterns common in Luraph encrypted strings
    const patterns = [
      /\\x[0-9a-fA-F]{2}/,  // Hex escape sequences
      /\\[0-9]{1,3}/,       // Octal escape sequences
      /[^\x20-\x7E]{5,}/,   // Non-printable character sequences
    ];

    return patterns.some(pattern => pattern.test(value));
  }

  private isObfuscatedName(name: string): boolean {
    // Detect common Luraph obfuscation patterns
    const patterns = [
      /^[a-zA-Z_][a-zA-Z0-9_]{20,}$/, // Very long identifiers
      /^[lI1oO0]{4,}$/,               // Confusing character combinations
      /^[a-zA-Z]_[a-zA-Z0-9_]{10,}$/, // Underscore patterns
    ];

    return patterns.some(pattern => pattern.test(name));
  }

  private getKeywordTokenType(keyword: string): LuaTokenType {
    const keywordMap: { [key: string]: LuaTokenType } = {
      'and': LuaTokenType.AND,
      'break': LuaTokenType.BREAK,
      'do': LuaTokenType.DO,
      'else': LuaTokenType.ELSE,
      'elseif': LuaTokenType.ELSEIF,
      'end': LuaTokenType.END,
      'false': LuaTokenType.FALSE,
      'for': LuaTokenType.FOR,
      'function': LuaTokenType.FUNCTION,
      'if': LuaTokenType.IF,
      'in': LuaTokenType.IN,
      'local': LuaTokenType.LOCAL,
      'nil': LuaTokenType.NIL,
      'not': LuaTokenType.NOT,
      'or': LuaTokenType.OR,
      'repeat': LuaTokenType.REPEAT,
      'return': LuaTokenType.RETURN,
      'then': LuaTokenType.THEN,
      'true': LuaTokenType.TRUE,
      'until': LuaTokenType.UNTIL,
      'while': LuaTokenType.WHILE,
    };

    return keywordMap[keyword] || LuaTokenType.IDENTIFIER;
  }

  private checkLongStringStart(): number {
    let level = 0;
    let pos = this.position + 1;

    while (pos < this.input.length && this.input[pos] === '=') {
      level++;
      pos++;
    }

    if (pos < this.input.length && this.input[pos] === '[') {
      return level;
    }

    return -1;
  }

  private skipWhitespace(): void {
    while (this.position < this.input.length && 
           this.isWhitespace(this.input[this.position]) && 
           this.input[this.position] !== '\n') {
      this.advance();
    }
  }

  private isWhitespace(char: string): boolean {
    return /\s/.test(char);
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  private isAlpha(char: string): boolean {
    return /[a-zA-Z]/.test(char);
  }

  private isAlphaNumeric(char: string): boolean {
    return /[a-zA-Z0-9]/.test(char);
  }

  private peek(offset: number = 1): string {
    const peekPosition = this.position + offset;
    return peekPosition < this.input.length ? this.input[peekPosition] : '';
  }

  private advance(count: number = 1): void {
    for (let i = 0; i < count && this.position < this.input.length; i++) {
      if (this.input[this.position] === '\n') {
        this.line++;
        this.column = 1;
      } else {
        this.column++;
      }
      this.position++;
    }
  }

  private createPosition(): LuaPosition {
    return {
      line: this.line,
      column: this.column,
      position: this.position
    };
  }

  private createToken(type: LuaTokenType, value: string, position: LuaPosition): LuaToken {
    return {
      type,
      value,
      line: position.line,
      column: position.column,
      position: position.position
    };
  }

  // Luraph-specific detection methods
  public detectLuraphPatterns(): Array<{ pattern: string; matches: RegExpMatchArray[] }> {
    const results: Array<{ pattern: string; matches: RegExpMatchArray[] }> = [];

    for (const pattern of LURAPH_PATTERNS) {
      const matches: RegExpMatchArray[] = [];
      let match: RegExpMatchArray | null;

      while ((match = pattern.pattern.exec(this.input)) !== null) {
        matches.push(match);
        if (!pattern.pattern.global) break;
      }

      if (matches.length > 0) {
        results.push({
          pattern: pattern.id,
          matches
        });
      }
    }

    return results;
  }
}