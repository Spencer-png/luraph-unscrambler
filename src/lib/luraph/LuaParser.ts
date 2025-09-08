import { LuaToken, LuaTokenType } from './types/LuaTokens';
import {
  ASTNode,
  ProgramNode,
  BlockStatementNode,
  FunctionDeclarationNode,
  IdentifierNode,
  LiteralNode,
  CallExpressionNode,
  AssignmentExpressionNode,
  TableConstructorNode,
  TableFieldNode,
  IfStatementNode,
  ForStatementNode,
  WhileStatementNode,
  ReturnStatementNode,
  BinaryExpressionNode,
  UnaryExpressionNode,
  VMHandlerNode,
  EncryptedStringNode,
  ConstantTableNode
} from './types/ASTNodes';

export class LuaParser {
  private tokens: LuaToken[];
  private position: number = 0;
  private current: LuaToken;

  constructor(tokens: LuaToken[]) {
    this.tokens = tokens.filter(token => 
      token.type !== LuaTokenType.WHITESPACE && 
      token.type !== LuaTokenType.COMMENT
    );
    this.position = 0;
    this.current = this.tokens[0];
  }

  public parse(): ProgramNode {
    const statements: ASTNode[] = [];

    while (!this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }
    }

    return {
      type: 'BlockStatement',
      position: { line: 1, column: 1 },
      statements
    };
  }

  private parseStatement(): ASTNode | null {
    try {
      // Skip newlines
      while (this.match(LuaTokenType.NEWLINE)) {
        // Continue
      }

      if (this.isAtEnd()) return null;

      // Local declarations
      if (this.match(LuaTokenType.LOCAL)) {
        return this.parseLocalStatement();
      }

      // Function declarations
      if (this.match(LuaTokenType.FUNCTION)) {
        return this.parseFunctionDeclaration(false);
      }

      // Control structures
      if (this.match(LuaTokenType.IF)) {
        return this.parseIfStatement();
      }

      if (this.match(LuaTokenType.FOR)) {
        return this.parseForStatement();
      }

      if (this.match(LuaTokenType.WHILE)) {
        return this.parseWhileStatement();
      }

      if (this.match(LuaTokenType.RETURN)) {
        return this.parseReturnStatement();
      }

      // Expression statements (assignments, calls)
      return this.parseExpressionStatement();

    } catch (error) {
      console.warn('Parse error:', error);
      this.synchronize();
      return null;
    }
  }

  private parseLocalStatement(): ASTNode {
    if (this.check(LuaTokenType.FUNCTION)) {
      this.advance(); // consume 'function'
      return this.parseFunctionDeclaration(true);
    }

    // Local variable declaration
    const names: IdentifierNode[] = [];
    names.push(this.parseIdentifier());

    while (this.match(LuaTokenType.COMMA)) {
      names.push(this.parseIdentifier());
    }

    let values: ASTNode[] = [];
    if (this.match(LuaTokenType.ASSIGN)) {
      values = this.parseExpressionList();
    }

    return {
      type: 'AssignmentExpression',
      position: this.previous().position,
      left: names,
      right: values,
      isLocal: true
    } as AssignmentExpressionNode;
  }

  private parseFunctionDeclaration(isLocal: boolean): FunctionDeclarationNode {
    const name = this.parseIdentifier();

    this.consume(LuaTokenType.LPAREN, "Expected '(' after function name");

    const parameters: IdentifierNode[] = [];
    if (!this.check(LuaTokenType.RPAREN)) {
      parameters.push(this.parseIdentifier());
      while (this.match(LuaTokenType.COMMA)) {
        parameters.push(this.parseIdentifier());
      }
    }

    this.consume(LuaTokenType.RPAREN, "Expected ')' after parameters");

    const body = this.parseBlock();

    this.consume(LuaTokenType.END, "Expected 'end' after function body");

    const funcDecl: FunctionDeclarationNode = {
      type: 'FunctionDeclaration',
      position: name.position,
      name,
      parameters,
      body,
      isLocal
    };

    // Check if this might be a VM handler
    if (this.isVMHandler(name.name, body)) {
      funcDecl.isVMHandler = true;
      funcDecl.handlerIndex = this.extractHandlerIndex(name.name);
    }

    return funcDecl;
  }

  private parseIfStatement(): IfStatementNode {
    const condition = this.parseExpression();
    this.consume(LuaTokenType.THEN, "Expected 'then' after if condition");

    const consequent = this.parseBlock();

    let alternate: ASTNode | undefined;
    if (this.match(LuaTokenType.ELSEIF)) {
      alternate = this.parseIfStatement(); // Recursive for elseif
    } else if (this.match(LuaTokenType.ELSE)) {
      alternate = this.parseBlock();
    }

    this.consume(LuaTokenType.END, "Expected 'end' after if statement");

    return {
      type: 'IfStatement',
      position: this.previous().position,
      condition,
      consequent,
      alternate
    };
  }

  private parseForStatement(): ForStatementNode {
    const position = this.previous().position;

    // Try to determine if it's numeric or generic for loop
    const checkpoint = this.position;
    const identifier = this.parseIdentifier();

    if (this.match(LuaTokenType.ASSIGN)) {
      // Numeric for loop: for i = 1, 10 do
      const init = this.parseExpression();
      this.consume(LuaTokenType.COMMA, "Expected ',' in numeric for loop");
      const limit = this.parseExpression();
      
      let step: ASTNode | undefined;
      if (this.match(LuaTokenType.COMMA)) {
        step = this.parseExpression();
      }

      this.consume(LuaTokenType.DO, "Expected 'do' after for clause");
      const body = this.parseBlock();
      this.consume(LuaTokenType.END, "Expected 'end' after for body");

      return {
        type: 'ForStatement',
        position,
        init: {
          type: 'AssignmentExpression',
          position: identifier.position,
          left: [identifier],
          right: [init],
          isLocal: true
        } as AssignmentExpressionNode,
        condition: limit,
        update: step || {
          type: 'Literal',
          position,
          value: 1,
          dataType: 'number'
        } as LiteralNode,
        body,
        kind: 'numeric'
      };
    } else {
      // Generic for loop: for k, v in pairs(t) do
      this.position = checkpoint; // Reset
      const names: IdentifierNode[] = [];
      names.push(this.parseIdentifier());

      while (this.match(LuaTokenType.COMMA)) {
        names.push(this.parseIdentifier());
      }

      this.consume(LuaTokenType.IN, "Expected 'in' in generic for loop");
      const expressions = this.parseExpressionList();

      this.consume(LuaTokenType.DO, "Expected 'do' after for clause");
      const body = this.parseBlock();
      this.consume(LuaTokenType.END, "Expected 'end' after for body");

      return {
        type: 'ForStatement',
        position,
        init: {
          type: 'AssignmentExpression',
          position,
          left: names,
          right: expressions,
          isLocal: true
        } as AssignmentExpressionNode,
        condition: expressions[0],
        update: {
          type: 'Literal',
          position,
          value: null,
          dataType: 'nil'
        } as LiteralNode,
        body,
        kind: 'generic'
      };
    }
  }

  private parseWhileStatement(): WhileStatementNode {
    const condition = this.parseExpression();
    this.consume(LuaTokenType.DO, "Expected 'do' after while condition");

    const body = this.parseBlock();

    this.consume(LuaTokenType.END, "Expected 'end' after while body");

    return {
      type: 'WhileStatement',
      position: this.previous().position,
      condition,
      body
    };
  }

  private parseReturnStatement(): ReturnStatementNode {
    const position = this.previous().position;
    const args: ASTNode[] = [];

    if (!this.check(LuaTokenType.NEWLINE) && !this.check(LuaTokenType.END) && !this.isAtEnd()) {
      args.push(...this.parseExpressionList());
    }

    return {
      type: 'ReturnStatement',
      position,
      arguments: args
    };
  }

  private parseExpressionStatement(): ASTNode {
    const expr = this.parseExpression();

    // Check if it's an assignment
    if (this.match(LuaTokenType.ASSIGN)) {
      const values = this.parseExpressionList();
      return {
        type: 'AssignmentExpression',
        position: expr.position,
        left: [expr],
        right: values,
        isLocal: false
      } as AssignmentExpressionNode;
    }

    return expr;
  }

  private parseBlock(): BlockStatementNode {
    const statements: ASTNode[] = [];
    const position = this.current ? this.current.position : { line: 1, column: 1 };

    while (!this.check(LuaTokenType.END) && 
           !this.check(LuaTokenType.ELSE) && 
           !this.check(LuaTokenType.ELSEIF) && 
           !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) {
        statements.push(stmt);
      }
    }

    return {
      type: 'BlockStatement',
      position,
      statements
    };
  }

  private parseExpression(): ASTNode {
    return this.parseOr();
  }

  private parseOr(): ASTNode {
    let expr = this.parseAnd();

    while (this.match(LuaTokenType.OR)) {
      const operator = this.previous().value;
      const right = this.parseAnd();
      expr = {
        type: 'BinaryExpression',
        position: expr.position,
        left: expr,
        operator,
        right
      } as BinaryExpressionNode;
    }

    return expr;
  }

  private parseAnd(): ASTNode {
    let expr = this.parseEquality();

    while (this.match(LuaTokenType.AND)) {
      const operator = this.previous().value;
      const right = this.parseEquality();
      expr = {
        type: 'BinaryExpression',
        position: expr.position,
        left: expr,
        operator,
        right
      } as BinaryExpressionNode;
    }

    return expr;
  }

  private parseEquality(): ASTNode {
    let expr = this.parseComparison();

    while (this.match(LuaTokenType.EQUAL, LuaTokenType.NOT_EQUAL)) {
      const operator = this.previous().value;
      const right = this.parseComparison();
      expr = {
        type: 'BinaryExpression',
        position: expr.position,
        left: expr,
        operator,
        right
      } as BinaryExpressionNode;
    }

    return expr;
  }

  private parseComparison(): ASTNode {
    let expr = this.parseConcat();

    while (this.match(LuaTokenType.GREATER_THAN, LuaTokenType.GREATER_EQUAL, 
                      LuaTokenType.LESS_THAN, LuaTokenType.LESS_EQUAL)) {
      const operator = this.previous().value;
      const right = this.parseConcat();
      expr = {
        type: 'BinaryExpression',
        position: expr.position,
        left: expr,
        operator,
        right
      } as BinaryExpressionNode;
    }

    return expr;
  }

  private parseConcat(): ASTNode {
    let expr = this.parseAdditive();

    while (this.match(LuaTokenType.CONCAT)) {
      const operator = this.previous().value;
      const right = this.parseAdditive();
      expr = {
        type: 'BinaryExpression',
        position: expr.position,
        left: expr,
        operator,
        right
      } as BinaryExpressionNode;
    }

    return expr;
  }

  private parseAdditive(): ASTNode {
    let expr = this.parseMultiplicative();

    while (this.match(LuaTokenType.PLUS, LuaTokenType.MINUS)) {
      const operator = this.previous().value;
      const right = this.parseMultiplicative();
      expr = {
        type: 'BinaryExpression',
        position: expr.position,
        left: expr,
        operator,
        right
      } as BinaryExpressionNode;
    }

    return expr;
  }

  private parseMultiplicative(): ASTNode {
    let expr = this.parseUnary();

    while (this.match(LuaTokenType.MULTIPLY, LuaTokenType.DIVIDE, LuaTokenType.MODULO)) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      expr = {
        type: 'BinaryExpression',
        position: expr.position,
        left: expr,
        operator,
        right
      } as BinaryExpressionNode;
    }

    return expr;
  }

  private parseUnary(): ASTNode {
    if (this.match(LuaTokenType.NOT, LuaTokenType.MINUS, LuaTokenType.LENGTH)) {
      const operator = this.previous().value;
      const right = this.parseUnary();
      return {
        type: 'UnaryExpression',
        position: this.previous().position,
        operator,
        argument: right
      } as UnaryExpressionNode;
    }

    return this.parsePower();
  }

  private parsePower(): ASTNode {
    let expr = this.parseCall();

    while (this.match(LuaTokenType.POWER)) {
      const operator = this.previous().value;
      const right = this.parseUnary(); // Right associative
      expr = {
        type: 'BinaryExpression',
        position: expr.position,
        left: expr,
        operator,
        right
      } as BinaryExpressionNode;
    }

    return expr;
  }

  private parseCall(): ASTNode {
    let expr = this.parsePrimary();

    while (true) {
      if (this.match(LuaTokenType.LPAREN)) {
        expr = this.finishCall(expr);
      } else if (this.match(LuaTokenType.LBRACKET)) {
        const index = this.parseExpression();
        this.consume(LuaTokenType.RBRACKET, "Expected ']' after index");
        expr = {
          type: 'BinaryExpression',
          position: expr.position,
          left: expr,
          operator: '[]',
          right: index
        } as BinaryExpressionNode;
      } else if (this.match(LuaTokenType.DOT)) {
        const name = this.parseIdentifier();
        expr = {
          type: 'BinaryExpression',
          position: expr.position,
          left: expr,
          operator: '.',
          right: name
        } as BinaryExpressionNode;
      } else {
        break;
      }
    }

    return expr;
  }

  private finishCall(callee: ASTNode): CallExpressionNode {
    const args: ASTNode[] = [];

    if (!this.check(LuaTokenType.RPAREN)) {
      args.push(...this.parseExpressionList());
    }

    this.consume(LuaTokenType.RPAREN, "Expected ')' after arguments");

    const callExpr: CallExpressionNode = {
      type: 'CallExpression',
      position: callee.position,
      callee: callee as IdentifierNode,
      arguments: args
    };

    // Check if this might be a VM call
    if (this.isVMCall(callee, args)) {
      callExpr.isVMCall = true;
      callExpr.vmOperation = this.detectVMOperation(callee, args);
    }

    return callExpr;
  }

  private parsePrimary(): ASTNode {
    if (this.match(LuaTokenType.TRUE)) {
      return {
        type: 'Literal',
        position: this.previous().position,
        value: true,
        dataType: 'boolean'
      } as LiteralNode;
    }

    if (this.match(LuaTokenType.FALSE)) {
      return {
        type: 'Literal',
        position: this.previous().position,
        value: false,
        dataType: 'boolean'
      } as LiteralNode;
    }

    if (this.match(LuaTokenType.NIL)) {
      return {
        type: 'Literal',
        position: this.previous().position,
        value: null,
        dataType: 'nil'
      } as LiteralNode;
    }

    if (this.match(LuaTokenType.NUMBER)) {
      const value = this.previous().value;
      return {
        type: 'Literal',
        position: this.previous().position,
        value: parseFloat(value),
        dataType: 'number'
      } as LiteralNode;
    }

    if (this.match(LuaTokenType.STRING)) {
      const value = this.previous().value;
      return {
        type: 'Literal',
        position: this.previous().position,
        value: value.slice(1, -1), // Remove quotes
        dataType: 'string'
      } as LiteralNode;
    }

    if (this.match(LuaTokenType.ENCRYPTED_STRING)) {
      const value = this.previous().value;
      return {
        type: 'EncryptedString',
        position: this.previous().position,
        encryptedValue: value,
        encryptionMethod: 'luraph'
      } as EncryptedStringNode;
    }

    if (this.match(LuaTokenType.IDENTIFIER, LuaTokenType.OBFUSCATED_NAME)) {
      return this.parseIdentifier();
    }

    if (this.match(LuaTokenType.LPAREN)) {
      const expr = this.parseExpression();
      this.consume(LuaTokenType.RPAREN, "Expected ')' after expression");
      return expr;
    }

    if (this.match(LuaTokenType.LBRACE)) {
      return this.parseTableConstructor();
    }

    throw new Error(`Unexpected token: ${this.current?.value || 'EOF'}`);
  }

  private parseIdentifier(): IdentifierNode {
    const token = this.previous();
    return {
      type: 'Identifier',
      position: token.position,
      name: token.value,
      isObfuscated: token.type === LuaTokenType.OBFUSCATED_NAME
    };
  }

  private parseTableConstructor(): TableConstructorNode {
    const position = this.previous().position;
    const fields: TableFieldNode[] = [];

    if (!this.check(LuaTokenType.RBRACE)) {
      fields.push(this.parseTableField());
      while (this.match(LuaTokenType.COMMA, LuaTokenType.SEMICOLON)) {
        if (this.check(LuaTokenType.RBRACE)) break;
        fields.push(this.parseTableField());
      }
    }

    this.consume(LuaTokenType.RBRACE, "Expected '}' after table constructor");

    const table: TableConstructorNode = {
      type: 'TableConstructor',
      position,
      fields
    };

    // Check if this might be a constant table
    if (this.isConstantTable(fields)) {
      table.isConstantTable = true;
    }

    return table;
  }

  private parseTableField(): TableFieldNode {
    const position = this.current.position;

    if (this.match(LuaTokenType.LBRACKET)) {
      // [key] = value
      const key = this.parseExpression();
      this.consume(LuaTokenType.RBRACKET, "Expected ']' after table key");
      this.consume(LuaTokenType.ASSIGN, "Expected '=' after table key");
      const value = this.parseExpression();

      return {
        type: 'TableField',
        position,
        key,
        value,
        kind: 'record'
      };
    } else {
      const expr = this.parseExpression();
      
      if (this.match(LuaTokenType.ASSIGN)) {
        // key = value
        const value = this.parseExpression();
        return {
          type: 'TableField',
          position,
          key: expr,
          value,
          kind: 'record'
        };
      } else {
        // value (list field)
        return {
          type: 'TableField',
          position,
          value: expr,
          kind: 'list'
        };
      }
    }
  }

  private parseExpressionList(): ASTNode[] {
    const expressions: ASTNode[] = [];
    expressions.push(this.parseExpression());

    while (this.match(LuaTokenType.COMMA)) {
      expressions.push(this.parseExpression());
    }

    return expressions;
  }

  // Luraph-specific detection methods
  private isVMHandler(name: string, body: BlockStatementNode): boolean {
    // Look for common VM handler patterns
    const patterns = [
      /handler_\d+/,
      /vm_\w+/,
      /[a-zA-Z_][a-zA-Z0-9_]{20,}/ // Very long names
    ];

    return patterns.some(pattern => pattern.test(name)) ||
           this.hasVMOperations(body);
  }

  private hasVMOperations(block: BlockStatementNode): boolean {
    // Check for patterns typical in VM handlers
    return block.statements.some(stmt => {
      if (stmt.type === 'CallExpression') {
        const call = stmt as CallExpressionNode;
        return this.isVMCall(call.callee, call.arguments);
      }
      return false;
    });
  }

  private extractHandlerIndex(name: string): number {
    const match = name.match(/(\d+)/);
    return match ? parseInt(match[1]) : -1;
  }

  private isVMCall(callee: ASTNode, args: ASTNode[]): boolean {
    if (callee.type !== 'Identifier') return false;
    
    const name = (callee as IdentifierNode).name;
    
    // Common VM operation patterns
    const vmPatterns = [
      /^vm_/,
      /^handler_/,
      /^op_/,
      /^exec_/
    ];

    return vmPatterns.some(pattern => pattern.test(name)) ||
           (args.length >= 3 && name.length > 15); // Luraph often uses 3+ arg calls
  }

  private detectVMOperation(callee: ASTNode, args: ASTNode[]): string {
    if (callee.type !== 'Identifier') return 'unknown';
    
    const name = (callee as IdentifierNode).name;
    
    // Try to map to known operations
    if (name.includes('move') || name.includes('MOVE')) return 'MOVE';
    if (name.includes('load') || name.includes('LOAD')) return 'LOADK';
    if (name.includes('call') || name.includes('CALL')) return 'CALL';
    if (name.includes('jump') || name.includes('JMP')) return 'JMP';
    
    return 'unknown';
  }

  private isConstantTable(fields: TableFieldNode[]): boolean {
    // Check if table contains only literal values (common in Luraph constant tables)
    return fields.every(field => 
      field.value.type === 'Literal' || 
      field.value.type === 'EncryptedString'
    ) && fields.length > 5; // Luraph constant tables are usually large
  }

  // Utility methods
  private match(...types: LuaTokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
  }

  private check(type: LuaTokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.current.type === type;
  }

  private advance(): LuaToken {
    if (!this.isAtEnd()) this.position++;
    this.current = this.tokens[this.position] || this.tokens[this.tokens.length - 1];
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.position >= this.tokens.length || this.current?.type === LuaTokenType.EOF;
  }

  private previous(): LuaToken {
    return this.tokens[this.position - 1];
  }

  private consume(type: LuaTokenType, message: string): LuaToken {
    if (this.check(type)) return this.advance();
    throw new Error(`${message}. Got: ${this.current?.value || 'EOF'}`);
  }

  private synchronize(): void {
    this.advance();

    while (!this.isAtEnd()) {
      if (this.previous().type === LuaTokenType.SEMICOLON) return;

      switch (this.current.type) {
        case LuaTokenType.FUNCTION:
        case LuaTokenType.LOCAL:
        case LuaTokenType.FOR:
        case LuaTokenType.IF:
        case LuaTokenType.WHILE:
        case LuaTokenType.RETURN:
          return;
      }

      this.advance();
    }
  }
}