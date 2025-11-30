import {
    ArrowFunction,
    BinaryExpression,
    Block,
    CallExpression,
    Expression,
    FunctionDeclaration, FunctionExpression,
    Identifier,
    IfStatement,
    ImportDeclaration,
    LeftHandSideExpression,
    Node, NumericLiteral,
    ParameterDeclaration,
    Project, ReturnStatement,
    Statement, StringLiteral,
    ts,
    Type,
    TypeOfExpression,
    VariableDeclarationKind,
    VariableStatement
} from "ts-morph";
import fs from 'node:fs'
import * as path from "node:path";
import {hasReturn} from "./helper";

const cwd = process.cwd();

const appDirectory = fs.realpathSync(cwd);

type CodeResult = {
    code: string
}

const project = new Project();

// 添加 `src` 目录下的所有 TypeScript 文件
project.addSourceFilesAtPaths("./test/ts/*.ts");

const polyfill = new Map<string, Map<string, string>>();
//是否在块级作用域
let isInBlock = false;
project.getSourceFiles().forEach(sourceFile => {
    let res = `import ts "ts2go/core/ts"\n`;
    sourceFile.getStatements().forEach(statement => {
        const sourcePath = statement.getSourceFile().getDirectory().getPath();
        let current = polyfill.get(sourcePath);
        if (!current) {
            current = new Map();
            polyfill.set(sourcePath, current)
        }
        res += parseStatement(statement).code + '\n';
    })
    const sourcePath = sourceFile.getDirectory().getPath();
    let pl = '';
    polyfill.get(sourcePath)?.forEach(item => {
        pl += item;
    })
    const code = pl + res;
    fs.writeFileSync(path.resolve(sourcePath, '../') + `/go/${sourceFile.getBaseNameWithoutExtension()}.go`, code)
})

/*function setCurrentEntryVar(node: Node, code: string) {
    const sourcePath = node.getSourceFile().getDirectory().getPath();
    let current = polyfill.get(sourcePath)!;
    current.set('typeof', code)
}*/

function parseTypeof(node: TypeOfExpression) {
    const exp = node.getExpression();
    return {
        code: `ts.G_typeof(${exp.getText()})`
    }
}

function parseStatement(statement: Statement): CodeResult {
    if (Node.isNode(statement)) {
        return parseNode(statement);
    }
    return {
        code: ''
    }
}

/**
 * 编译器上下文（你只需要在最外层创建一次）
 */
interface CompilerContext {
    /** 项目根目录（绝对路径），例如 /Users/you/my-gojs-project */
    projectRoot: string;

    /** go.mod 里的 module 名称，例如 "github.com/you/gojs-project" */
    goModuleName: string;

    /** 当前正在编译的 TS 文件的绝对路径 */
    currentFile: string;

    /** TS → Go 文件的目录映射规则（默认 src → go） */
    srcDir: string;   // 默认 "src"
    goDir: string;    // 默认 "go"
}


/** 解析相对路径为绝对路径 */
function resolveApp(relativePath: string) {
    return path.resolve(appDirectory, relativePath)
}

/**
 * 把任意 import 转成统一的 Go 导入形式：
 *   1. import { x } from "./util"        → import util "xxx/go/util"
 *                                             var x = util.G_x
 *   2. import * as foo from "./util"     → import foo "xxx/go/util"
 *   3. import foo from "./util"          → import foo "xxx/go/util"
 *                                             var foo = foo.G_default   (如果有 default)
 */
function parseImportDeclaration(
    node: ImportDeclaration,
) {
    const sourceFile = node.getSourceFile();
    const currentFile = sourceFile.getFilePath()
    const rootPath = resolveApp('')
    const ctx: CompilerContext = {
        projectRoot: rootPath,
        goModuleName: "ts2go",
        currentFile: currentFile,
        srcDir: resolveApp('./test/ts'),
        goDir: resolveApp('./test/go')
    }
    const imports: string[] = [];
    const extraVars: string[] = [];

    const moduleSpecifier = node.getModuleSpecifier();
    if (!moduleSpecifier) return {code: "", imports: []};

    const rawPath = moduleSpecifier.getLiteralText(); // "./utils/math" 或者 "lodash"

    // ---------- 1. 计算最终的 Go import path ----------
    let goImportPath: string;

    if (rawPath.startsWith(".")) {
        // 相对路径 → 解析成项目内的 .go 文件对应路径
        const currentDir = path.dirname(ctx.currentFile);
        let targetAbs = path.resolve(currentDir, rawPath);

        // 补全可能的 .ts/.tsx 后缀
        if (!path.extname(targetAbs)) targetAbs += ".ts";
        const goFileAbs = targetAbs.replace(/\.(ts|tsx|js|jsx)$/i, ".go");

        // 把 srcDir → goDir
        const relToSrc = path.relative(ctx.srcDir, goFileAbs);
        goImportPath = path.join(ctx.goModuleName, ctx.goDir.replace(ctx.projectRoot, ""), path.dirname(relToSrc), path.basename(relToSrc, ".go"))
            .replaceAll("\\", "/");
    } else {
        // 第三方包直接保持原样（以后可以自行映射）
        goImportPath = rawPath;
    }

    // 包别名：我们统一使用最后一个路径段（去掉 .go）作为包名
    const pkgAlias = path.basename(goImportPath);

    // ---------- 2. 处理三种导入方式 ----------
    const namedImports = node.getNamedImports();          // import { a, b }
    const namespaceImport = node.getNamespaceImport();     // import * as xxx
    const defaultImport = node.getDefaultImport();         // import xxx from "..."

    // 情况 1 & 2 & 3：不管哪种，都先 import 包
    if (namespaceImport) {
        // import * as math from "./math"  →  import math "xxx/go/math"
        const alias = namespaceImport.getText();
        imports.push(`import ${alias} "${goImportPath}"`);
    } else {
        // 其他两种都用最后一个路径段作为包别名
        imports.push(`import ${pkgAlias} "${goImportPath}"`);
    }

    // ---------- 命名导入 ----------
    if (namedImports.length > 0) {
        for (const spec of namedImports) {
            const nameNode = spec.getNameNode();
            const importedName = nameNode.getText();
            const localName = spec.getAliasNode()?.getText() ?? importedName;

            // 生成 var xxx = pkg.G_xxx
            extraVars.push(`var G_${localName} = ${pkgAlias}.G_${importedName}`);
        }
    }

    // ---------- 默认导入 ----------
    if (defaultImport) {
        const localName = defaultImport.getText();
        extraVars.push(`var G_${localName} = ${pkgAlias}.G_default`);
    }

    // ---------- 组合输出 ----------
    const finalCode = [...imports, ...extraVars].join("\n") + (extraVars.length || imports.length ? "\n" : "");
    return {code: finalCode};
}

function parseIfStatement(node: IfStatement) {
    const t = node.getThenStatement();
    const e = node.getElseStatement();
    const exp = parseExpression(node.getExpression())
    const tst = parseStatement(t);
    const est = e ? parseStatement(e) : null;
    return {
        code: `if(${exp.code})${tst.code}${e ? `else${est?.code}` : ''}`
    }
}


function parseVariableStatement(node: VariableStatement) {
    const isExport = node.hasModifier(ts.SyntaxKind.ExportKeyword)
    const dl = node.getDeclarationList();
    // 获取变量的声明类型：let、const 或 var
    const kind = node.getDeclarationKind();
    let res = `${parseDeclarationKind(kind)}`;
    const list = dl.getDeclarations();
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
        return ` ${isExport ? 'G_' : ''}${name} ${_type}${initializer ? ` = ${parseExpression(initializer).code}` : ''}`
    }).join(',')
    res += ';'
    return {
        code: res
    }
}

function parseIdentifier(id: Identifier) {
    return {
        code: `${isInBlock ? "" : "G_"}${id.getText()}.(${parseType(id.getType())})`
    }
}

function parseStringLiteral(node: StringLiteral) {
    return {
        code: `ts.String("${node.getLiteralValue()}")`
    };
}

function parseNumericLiteral(node: NumericLiteral) {
    return {
        code: `ts.Number(${node.getLiteralValue()})`
    };
}

function parseBinaryExpression(expression: BinaryExpression) {
    const left = parseExpression(expression.getLeft());
    const right = parseExpression(expression.getRight());
    const op = expression.getOperatorToken()
    return {
        code: `${left.code} ${op.getText()} ${right.code}`
    }
}

function isFunctionLike(node: Node) {
    return Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isFunctionDeclaration(node);
}

function parseFunctionLike(node: ArrowFunction | FunctionExpression | FunctionDeclaration): CodeResult {
    const isExport = node.hasModifier(ts.SyntaxKind.ExportKeyword)
    const parameters = node.getParameters();
    const args = parseParameters(parameters).code;
    const body = parseBody(node.getBody());
    const returnType = parseType(node.getReturnType());
    let name: string = '';
    if (!Node.isArrowFunction(node)) {
        name = node.getName() || "";
    }
    return {
        code: `func ${isExport ? 'G_' : ''}${name}(${args}) ${returnType} ${body.code}`
    }
}

function parseExpression(expression?: Expression): CodeResult {
    if (!expression) {
        return {
            code: ''
        }
    }
    if (Node.isIdentifier(expression)) {
        return parseIdentifier(expression)
    } else if (Node.isNumericLiteral(expression)) {
        return parseNumericLiteral(expression);
    } else if (Node.isTypeOfExpression(expression)) {
        return parseTypeof(expression);
    } else if (Node.isArrowFunction(expression)) {
        return parseFunctionLike(expression);
    } else if (Node.isStringLiteral(expression)) {
        return parseStringLiteral(expression)
    } else if (Node.isBinaryExpression(expression)) {
        return parseBinaryExpression(expression)
    } else if (Node.isCallExpression(expression)) {
        return parseCallExpression(expression);
    }
    return {code: ''}
}

function isGlobalIdentifier(id: Identifier): boolean {
    // 情况2：完全没有 symbol → 一定是运行环境提供的全局（如 console、alert）
    if (!id.getSymbol()) {
        return true;
    }

    // 情况3：有 symbol，但来自 lib.*.d.ts → 全局
    const decls = id.getDefinitions();

    if (decls.length > 0) {
        const file = decls[0].getSourceFile()?.getFilePath() ?? "";
        if (file.endsWith("/node_modules/typescript/lib/lib.dom.d.ts")) {
            return true;
        }
    }

    // 其他 → 用户定义的
    return false;
}


function parseLeftHandSideExpression(expression: LeftHandSideExpression): CodeResult {
    if (Node.isIdentifier(expression)) {
        const isGlobal = isGlobalIdentifier(expression);
        return {
            code: `${isGlobal ? "ts.Global." : ""}G_${expression.getText()}`
        }
    }
    if (Node.isPropertyAccessExpression(expression)) {
        const last = expression.getName();
        const exp = expression.getExpression();
        return {
            code: `${parseLeftHandSideExpression(exp).code}.G_${last}`
        }
    }
    return {
        code: expression.getText()
    }
}

function parseNode(node: Node): CodeResult {
    // 检查 statement 是否是导出的
    if (Node.isVariableStatement(node)) {
        return parseVariableStatement(node);
    } else if (Node.isFunctionDeclaration(node)) {
        return parseFunctionLike(node)
    } else if (Node.isExpressionStatement(node)) {
        return parseExpression(node.getExpression())
    } else if (Node.isExpression(node)) {
        return parseExpression(node)
    } else if (Node.isExportAssignment(node)) {
        let name = 'default';
        const expression = node.getExpression();
        const declaration = expression.getSymbol()!.getDeclarations()[0]!;
        const isExport = declaration.getCombinedModifierFlags() === ts.ModifierFlags.Export
        return {code: `var G_${name} = ${(isExport ? 'G_' : "") + expression.getText()}`}
    } else if (Node.isIfStatement(node)) {
        return parseIfStatement(node)
    } else if (Node.isBlock(node)) {
        return parseBlock(node)
    } else if (Node.isImportDeclaration(node)) {
        return parseImportDeclaration(node)
    }
    if (Node.isReturnStatement(node)) {
        return parseReturnTyped(node)
    }
    return {
        code: node.getText()
    }
}

function parseReturnTyped(node: ReturnStatement) {
    const exp = node.getExpression();
    let content = `ts.Undefined()`
    if (exp) {
        content = parseExpression(exp).code;
    }
    return {
        code: `return ${content}`
    }
}

function parseArguments(args: Node[]) {
    return {
        code: args.map(arg => parseNode(arg).code).join(',')
    }
}

function parseCallExpression(expression: CallExpression) {
    const args = expression.getArguments();
    const exp = expression.getExpression();
    return {
        code: `${parseLeftHandSideExpression(exp).code}(${parseArguments(args).code})`
    }
}


function parseParameters(parameters: ParameterDeclaration[]) {
    return {
        code: parameters.map(p => parseParameter(p).code).join(',')
    }
}

function parseParameter(arg: ParameterDeclaration) {
    return {
        code: `${arg.getName()} ${parseType(arg.getType())}`
    }
}

function parseBody(body?: Node) {
    const res = {code: ''}
    if (!body) {
        return res
    }
    if (!Node.isBlock(body)) {
        // => 表达式形式
        const exprCode = parseNode(body);
        return {
            code: `return ${exprCode}`
        }
    }
    const content = parseBlock(body).code
    res.code = content
    return res;
}

function parseBlock(block: Block): CodeResult {
    isInBlock = true;
    const content = block.getStatements().map(s => parseStatement(s).code).join(';')
    isInBlock = false;
    const parent = block.getParent()
    const returned = isFunctionLike(parent) && !hasReturn(block)
    return {
        code: `{\n${content}${returned ? `\nreturn ts.Undefined()` : ""}\n}`
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
        return 'ts.Number'
    } else if (type.isString()) {
        return 'ts.String'
    } else if (type.isStringLiteral()) {
        return 'ts.String'
    } else if (type.isBoolean()) {
        return 'ts.Boolean'
    } else if (type.isNull()) {
        return 'ts.Null'
    } else if (type.isUndefined()) {
        return 'ts.Undefined'
    } else if (type.isVoid()) {
        return 'ts.Undefined'
    } else if (type.isUnionOrIntersection()) {
        return 'Any'
    }
    return type.getText();
}