// Abstract Syntax Tree node definitions
export interface ASTNode {
  type: string;
  position: {
    line: number;
    column: number;
  };
  children?: ASTNode[];
}

export interface LiteralNode extends ASTNode {
  type: 'Literal';
  value: string | number | boolean | null;
  dataType: 'string' | 'number' | 'boolean' | 'nil';
}

export interface IdentifierNode extends ASTNode {
  type: 'Identifier';
  name: string;
  isObfuscated?: boolean;
  originalName?: string;
}

export interface FunctionDeclarationNode extends ASTNode {
  type: 'FunctionDeclaration';
  name: IdentifierNode;
  parameters: IdentifierNode[];
  body: BlockStatementNode;
  isLocal: boolean;
  isVMHandler?: boolean;
  handlerIndex?: number;
}

export interface CallExpressionNode extends ASTNode {
  type: 'CallExpression';
  callee: IdentifierNode;
  arguments: ASTNode[];
  isVMCall?: boolean;
  vmOperation?: string;
}

export interface BlockStatementNode extends ASTNode {
  type: 'BlockStatement';
  statements: ASTNode[];
}

export interface AssignmentExpressionNode extends ASTNode {
  type: 'AssignmentExpression';
  left: ASTNode[];
  right: ASTNode[];
  isLocal: boolean;
}

export interface TableConstructorNode extends ASTNode {
  type: 'TableConstructor';
  fields: TableFieldNode[];
  isConstantTable?: boolean;
}

export interface TableFieldNode extends ASTNode {
  type: 'TableField';
  key?: ASTNode;
  value: ASTNode;
  kind: 'list' | 'record';
}

export interface IfStatementNode extends ASTNode {
  type: 'IfStatement';
  condition: ASTNode;
  consequent: BlockStatementNode;
  alternate?: ASTNode;
}

export interface ForStatementNode extends ASTNode {
  type: 'ForStatement';
  init: ASTNode;
  condition: ASTNode;
  update: ASTNode;
  body: BlockStatementNode;
  kind: 'numeric' | 'generic';
}

export interface WhileStatementNode extends ASTNode {
  type: 'WhileStatement';
  condition: ASTNode;
  body: BlockStatementNode;
}

export interface ReturnStatementNode extends ASTNode {
  type: 'ReturnStatement';
  arguments: ASTNode[];
}

export interface BinaryExpressionNode extends ASTNode {
  type: 'BinaryExpression';
  left: ASTNode;
  operator: string;
  right: ASTNode;
}

export interface UnaryExpressionNode extends ASTNode {
  type: 'UnaryExpression';
  operator: string;
  argument: ASTNode;
}

// Luraph-specific nodes
export interface VMHandlerNode extends ASTNode {
  type: 'VMHandler';
  index: number;
  function: FunctionDeclarationNode;
  operations: VMOperationNode[];
}

export interface VMOperationNode extends ASTNode {
  type: 'VMOperation';
  opcode: number;
  operands: ASTNode[];
  originalInstruction?: string;
}

export interface EncryptedStringNode extends ASTNode {
  type: 'EncryptedString';
  encryptedValue: string;
  decryptedValue?: string;
  encryptionMethod: string;
}

export interface ConstantTableNode extends ASTNode {
  type: 'ConstantTable';
  name: string;
  constants: (string | number | boolean)[];
  isDecrypted?: boolean;
}

// AST visitor interface
export interface ASTVisitor {
  visitLiteral?(node: LiteralNode): ASTNode;
  visitIdentifier?(node: IdentifierNode): ASTNode;
  visitFunctionDeclaration?(node: FunctionDeclarationNode): ASTNode;
  visitCallExpression?(node: CallExpressionNode): ASTNode;
  visitBlockStatement?(node: BlockStatementNode): ASTNode;
  visitAssignmentExpression?(node: AssignmentExpressionNode): ASTNode;
  visitTableConstructor?(node: TableConstructorNode): ASTNode;
  visitIfStatement?(node: IfStatementNode): ASTNode;
  visitForStatement?(node: ForStatementNode): ASTNode;
  visitWhileStatement?(node: WhileStatementNode): ASTNode;
  visitReturnStatement?(node: ReturnStatementNode): ASTNode;
  visitBinaryExpression?(node: BinaryExpressionNode): ASTNode;
  visitUnaryExpression?(node: UnaryExpressionNode): ASTNode;
  visitVMHandler?(node: VMHandlerNode): ASTNode;
  visitVMOperation?(node: VMOperationNode): ASTNode;
  visitEncryptedString?(node: EncryptedStringNode): ASTNode;
  visitConstantTable?(node: ConstantTableNode): ASTNode;
}

export type ProgramNode = BlockStatementNode;