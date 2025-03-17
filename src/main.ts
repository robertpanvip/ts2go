import {
    BinaryExpression,
    Block,
    CallExpression,
    Expression,
    FunctionDeclaration,
    Node,
    ParameterDeclaration,
    Project,
    Statement,
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
    let res = '';
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
    }
    return {code: ''}
}

function parseCallExpression(expression: CallExpression) {
    console.log('expression', expression.getText());
    return {
        code: expression.getText()
    }
}

function parseBinaryExpression(expression: BinaryExpression) {
    const left = parseExpression(expression.getLeft());
    const right = parseExpression(expression.getRight());
    const op = expression.getOperatorToken()
    return {
        code: `${left.code}${op.getText()}${right.code}`
    }
}


function parseFunctionDeclaration(node: FunctionDeclaration) {
    const parameters = node.getParameters();
    const args = parameters.map(p => parseParameter(p).code).join(',');
    const body = parseBody(node.getBody())
    return {
        code: `fun ${node.getName()}(${args})${body.code}`
    }
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
        code: `{\n${block.getStatements().map(s => parseStatement(s).code).join(';')}\n}`
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