import {
    BinaryExpression,
    Block,
    CallExpression,
    Expression,
    FunctionDeclaration, FunctionExpression,
    Node,
    ParameterDeclaration,
    Project, PropertyAccessExpression,
    Statement, SyntaxKind,
    Type,
    VariableDeclarationKind,
    VariableStatement
} from "ts-morph";
import fs from 'node:fs'


type CodeResult = {
    code: string
}

const project = new Project();

// 添加 `src` 目录下的所有 TypeScript 文件
project.addSourceFilesAtPaths("../test/**/*.ts");

project.getSourceFiles().forEach(sourceFile => {
    let res = 'package main\n';
    sourceFile.getStatements().forEach(statement => {
        res += parseStatement(statement).code + '\n';
    })
    console.log('sss', res)
    fs.writeFileSync(sourceFile.getDirectory().getPath() + `/${sourceFile.getBaseNameWithoutExtension()}.go`, res)
})

function parseStatement(statement: Statement): CodeResult {
    if (Node.isVariableStatement(statement)) {
        return parseVariableStatement(statement)
    } else if (Node.isFunctionDeclaration(statement)) {
        return parseFunctionDeclaration(statement)
    } else if (Node.isExpressionStatement(statement)) {
        return parseExpression(statement.getExpression())
    }
    return {
        code: ''
    }
}

function parseVariableStatement(node: VariableStatement) {
    // 获取变量的声明类型：let、const 或 var
    const kind = node.getDeclarationKind();
    let res = `${parseDeclarationKind(kind)}`;
    const list = node.getDeclarations();
    res += list.map(item => {
        const name = item.getName();
        const type = item.getType();
        const initializer = item.getInitializer();
        let _type = ''
        if (type) {
            _type += parseType(type)
        } else if (initializer) {
            _type += parseType(initializer?.getType())
        }
        return ` ${name} ${_type}${initializer ? `=${parseExpression(initializer).code}` : ''}`
    }).join(',')
    res += ';'
    return {
        code: res
    }
}


function parseExpression(expression?: Expression): CodeResult {
    if (!expression) {
        return {
            code: ''
        }
    }
    if (Node.isNumericLiteral(expression)) {
        return {
            code: expression.getText()
        };
    } else if (Node.isStringLiteral(expression)) {
        return {
            code: expression.getText()
        };
    } else if (Node.isBinaryExpression(expression)) {
        return {
            code: parseBinaryExpression(expression).code
        }
    } else if (Node.isCallExpression(expression)) {
        return parseCallExpression(expression);
    } else if (Node.isPropertyAccessExpression(expression)) {
        return parsePropertyAccessExpression(expression)
    } else if (Node.isFunctionExpression(expression)) {
        return parseFunction(expression)
    }
    return {code: ''}
}

function parsePropertyAccessExpression(expression: PropertyAccessExpression) {
    //todo
    return {code: expression.getText()}
}

function parseCallExpression(expression: CallExpression) {
    console.log('expression', expression.getText());
    const callee = expression.getExpression();
    if (Node.isPropertyAccessExpression(callee)) {

        const object = callee.getExpression();
        //const property = callee.getName();
        console.log(object.getText())
    }
    return {
        code: expression.getText()
    }
}

function parseBinaryExpression(expression: BinaryExpression) {
    console.log('left', Node.isPropertyAccessExpression(expression.getLeft()), expression.getLeft().getText(), expression.getRight().getText())

    const left = parseExpression(expression.getLeft());
    const right = parseExpression(expression.getRight());
    const op = expression.getOperatorToken()
    return {
        code: `${left.code}${op.getText()}${right.code}`
    }
}

function parseFunction(node: FunctionExpression | FunctionDeclaration) {
    const parameters = node.getParameters();
    const args = parameters.map(p => parseParameter(p).code).join(',');
    const body = parseBody(node.getBody());
    const name = node.getName() || "";
    const exported = isFunctionExported(node);

    return {
        code: `func ${exported ? capitalizeFirstLetter(name) : name}(${args})${body.code}`
    }
}

function parseFunctionDeclaration(node: FunctionDeclaration) {
    return parseFunction(node)
}

function parseParameter(arg: ParameterDeclaration) {
    return {
        code: `${arg.getName()} ${parseType(arg.getType())}`
    }
}

function parseBody(body: Node | undefined) {
    const res = {code: ''}
    if (!body) {
        return res
    }
    if (Node.isBlock(body)) {
        return parseBlock(body)
    }
    return res;
}

function parseBlock(block: Block): CodeResult {
    return {
        code: `{\n${block.getStatements().map(s => parseStatement(s).code).join('')}\n}`
    }
}


function parseDeclarationKind(kind: VariableDeclarationKind) {
    switch (kind) {
        case VariableDeclarationKind.Var:
            return 'var'
        case VariableDeclarationKind.Let:
            return 'var'
        case VariableDeclarationKind.Const:
            return 'const'
    }
    return kind.toString()
}

function parseType(type: Type) {
    if (type.isNumber()) {
        return 'int64'
    }
    return type.getText();
}

function capitalizeFirstLetter(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function isFunctionExported(node: FunctionExpression | FunctionDeclaration): boolean {
    if (Node.isFunctionDeclaration(node)) {
        // 对于函数声明，直接检查是否导出
        const isExported = node.isExported();
        console.log(`FunctionDeclaration ${node.getName() || "anonymous"} is exported: ${isExported}`);
        return isExported;
    } else if (Node.isFunctionExpression(node)) {
        // 对于函数表达式，检查父节点的导出状态
        let current: Node | undefined = node.getParent();

        while (current) {
            if (Node.isVariableStatement(current)) {
                const isExported = current.isExported();
                console.log(`FunctionExpression in variable statement is exported: ${isExported}`);
                return isExported;
            } else if (Node.isExportDeclaration(current)) {
                // 处理 export { foo }
                console.log("FunctionExpression in export declaration");
                return true;
            } else if (Node.isObjectLiteralExpression(current)) {
                // 检查对象是否被导出
                const symbol = current.getSymbol();
                if (symbol) {
                    const declarations = symbol.getDeclarations();
                    for (const decl of declarations) {
                        if (Node.isVariableDeclaration(decl)) {
                            const varStatement = decl.getParentIfKind(SyntaxKind.VariableStatement);
                            if (varStatement && varStatement.isExported()) {
                                console.log(`FunctionExpression in exported object ${symbol.getName()}`);
                                return true;
                            }
                        } else if (Node.isExportDeclaration(decl)) {
                            console.log(`FunctionExpression in exported object via export declaration`);
                            return true;
                        }
                    }
                }
            }
            current = current.getParent();
        }

        console.log("FunctionExpression is not exported");
        return false;
    }

    return false;
}