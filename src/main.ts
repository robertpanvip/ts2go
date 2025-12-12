import {
    ArrayLiteralExpression,
    ArrowFunction,
    BinaryExpression,
    Block,
    CallExpression, ClassDeclaration, ClassMemberTypes, ConstructorDeclaration, ExportAssignment,
    Expression, ExpressionStatement, ForStatement,
    FunctionDeclaration,
    FunctionExpression,
    Identifier,
    IfStatement,
    ImportDeclaration,
    LeftHandSideExpression, MethodDeclaration, NewExpression,
    Node,
    NumericLiteral, ObjectLiteralElementLike, ObjectLiteralExpression,
    ParameterDeclaration, PostfixUnaryExpression, PrefixUnaryExpression,
    Project, PropertyAssignment, PropertyDeclaration,
    ReturnStatement,
    Statement,
    StringLiteral, SyntaxKind,
    ts,
    Type, TypeAliasDeclaration, TypeLiteralNode,
    TypeOfExpression, UnaryExpression, VariableDeclaration,
    VariableDeclarationKind, VariableDeclarationList,
    VariableStatement
} from "ts-morph";
import fs from 'node:fs'
import * as path from "node:path";
import {hasReturn, isFunctionType} from "./helper";

const cwd = process.cwd();

const appDirectory = fs.realpathSync(cwd);

type CodeResult = {
    code: string,
    type?: string
}

const project = new Project();

// 添加 `src` 目录下的所有 TypeScript 文件
project.addSourceFilesAtPaths("./test/ts/*.ts");

const importVars = new Map<string, Map<string, string>>();
let expId = 0;

project.getSourceFiles().forEach(sourceFile => {
    let res = `package ${sourceFile.getBaseNameWithoutExtension()}\nimport ts "github.com/robertpanvip/ts2go/core"\n`;
    sourceFile.getStatements().forEach(statement => {
        const sourcePath = statement.getSourceFile().getDirectory().getPath();
        let current = importVars.get(sourcePath);
        if (!current) {
            current = new Map();
            importVars.set(sourcePath, current)
        }
        res += parseStatement(statement).code + '\n';
    })
    const sourcePath = sourceFile.getDirectory().getPath();
    const baseName = sourceFile.getBaseNameWithoutExtension();
    fs.writeFileSync(path.resolve(sourcePath, '../') + `/go/${baseName}/${baseName}.go`, res)
})

function setCurrentEntryVars(node: Node, key: string, code: string) {
    const sourcePath = node.getSourceFile().getDirectory().getPath();
    let current = importVars.get(sourcePath)!;
    current.set(key, code)
}

function getCurrentEntryVars(node: Node, key: string) {
    const sourcePath = node.getSourceFile().getDirectory().getPath();
    let current = importVars.get(sourcePath)!;
    return current.get(key)
}

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
        imports.push(`import ${alias} "github.com/robertpanvip/${goImportPath}"`);
    } else {
        // 其他两种都用最后一个路径段作为包别名
        imports.push(`import ${pkgAlias} "github.com/robertpanvip/${goImportPath}"`);
    }

    // ---------- 命名导入 ----------
    if (namedImports.length > 0) {
        for (const spec of namedImports) {
            const nameNode = spec.getNameNode();
            const importedName = nameNode.getText();
            const localName = spec.getAliasNode()?.getText() ?? importedName;

            // 生成 var xxx = pkg.G_xxx
            const extraVar = `var G_${localName} = ${pkgAlias}.G_${importedName}`
            extraVars.push(extraVar);
            setCurrentEntryVars(node, localName, extraVar)
        }
    }

    // ---------- 默认导入 ----------
    if (defaultImport) {
        const localName = defaultImport.getText();
        const extraVar = `var G_${localName} = ${pkgAlias}.G_default`
        extraVars.push(extraVar);
        setCurrentEntryVars(node, localName, extraVar)
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
        code: `if ${exp.code} ${tst.code}${e ? ` else ${est?.code}` : ''}`
    }
}

function parseForStatement(node: ForStatement) {
    const isSourceFileChild = Node.isSourceFile(node.getParent())
    const initializer = node.getInitializer();
    const condition = node.getCondition();
    const incrementor = node.getIncrementor();
    const statement = node.getStatement();
    const exp = initializer ? parseNode(initializer) : {code: ""};
    const c = parseExpression(condition)
    const i = parseExpression(incrementor)
    const s = parseStatement(statement);
    let result = `for ${exp.code}; ${c.code}; ${i.code} ${s.code}`
    if (isSourceFileChild) {
        const name = `__iife${expId++}`;
        result = `func ${name}() ts.Undefined {\n\t${result.split('\n').join(`\n\t`)}\n\treturn ts.Undefined{}\n}\nvar __exp${expId++} = ${name}()\n`
    }
    return {
        code: `${result}`
    }
}

function parseVariableDeclarationList(node: VariableDeclarationList) {
    const parent = node.getParent();
    let isExport = false
    if (Node.isVariableStatement(parent)) {
        isExport = parent.hasModifier(ts.SyntaxKind.ExportKeyword)
    }
    const parentIsForStatement = Node.isForStatement(parent);
    const kind = node.getDeclarationKind();
    let varStr = `${parseDeclarationKind(kind)}`;
    const list = node.getDeclarations();
    let res = list.map(item => {
        return `${parentIsForStatement ? "" : `${varStr} `}${isExport ? 'G_' : ''}${parseVariableDeclaration(item).code}`
    }).join('\n')
    res += ''
    return {
        code: res
    }
}

function parseVariableDeclaration(node: VariableDeclaration) {
    const superIsForStatement = Node.isForStatement(node.getParent().getParent());
    const name = node.getName();
    const type = node.getType();
    const initializer = node.getInitializer();
    let _type = ''
    if (type) {
        _type += parseType(type)
    } else if (initializer) {
        _type += parseType(initializer?.getType())
    }
    return {
        code: `${name} ${superIsForStatement ? ":" : " "}${superIsForStatement ? "" : `${_type} `}${initializer ? `= ${parseExpression(initializer).code}` : ''}`
    }
}

function parseVariableStatement(node: VariableStatement) {
    return {
        code: parseVariableDeclarationList(node.getDeclarationList()).code
    }
}

function parseIdentifier(id: Identifier) {
    const df = id.getSymbol()?.getDeclarations()[0];
    const vs = df?.getParent()?.getParent();
    let isExport = false;
    if (vs) {
        if (Node.isVariableStatement(vs)) {
            isExport = vs.hasModifier(ts.SyntaxKind.ExportKeyword)
        }
    }
    if(Node.isClassDeclaration(df)){
        isExport = df.hasModifier(ts.SyntaxKind.ExportKeyword)
    }

    const isGlobal = isGlobalIdentifier(id);
    const globalStr = isGlobal ? "ts.Global." : ""
    if (df && Node.isFunctionDeclaration(df)) {
        isExport = df.hasModifier(ts.SyntaxKind.ExportKeyword)
        return {
            code: `${globalStr}${isExport || isGlobal ? "G_" : ""}${id.getText()}`
        }
    }
    const refType = df?.getType();
    const isAny = refType ? parseType(refType) === 'ts.Any' : false;
    // 普通变量/属性：非全局需要加 .(Type) 类型断言
    const typeAssertion = isGlobal || (!isAny) ? "" : `.(${parseType(id.getType())})`
    const isImport = !!getCurrentEntryVars(id, id.getText());

    return {
        code: `${globalStr}${isExport || isGlobal || isImport ? "G_" : ""}${id.getText()}${typeAssertion}`
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

function parseOperatorToken(op: Node<ts.BinaryOperatorToken>, left: string, right: string): CodeResult {
    const text = op.getText();           // 原始 token 文本，例如 "===", "+", "??"
    const kind = op.getKind();

    // 绝大多数运算符 Go 和 TS 完全一样，直接原样输出
    const directMap = new Map<ts.SyntaxKind, string>([
        [ts.SyntaxKind.PlusToken, "+"],
        [ts.SyntaxKind.MinusToken, "-"],
        [ts.SyntaxKind.AsteriskToken, "*"],
        [ts.SyntaxKind.SlashToken, "/"],
        [ts.SyntaxKind.PercentToken, "%"],
        [ts.SyntaxKind.AsteriskAsteriskToken, "**"],        // Go 1.21+ 支持 math.Pow，但我们保留 **
        [ts.SyntaxKind.LessThanToken, "<"],
        [ts.SyntaxKind.LessThanEqualsToken, "<="],
        [ts.SyntaxKind.GreaterThanToken, ">"],
        [ts.SyntaxKind.GreaterThanEqualsToken, ">="],
        [ts.SyntaxKind.AmpersandToken, "&"],
        [ts.SyntaxKind.BarToken, "|"],
        [ts.SyntaxKind.CaretToken, "^"],
        [ts.SyntaxKind.AmpersandAmpersandToken, "&&"],
        [ts.SyntaxKind.BarBarToken, "||"],
        [ts.SyntaxKind.EqualsEqualsEqualsToken, "=="],  // JS ==  → Go ==
        [ts.SyntaxKind.ExclamationEqualsEqualsToken, "!="],     // !== → ts.G_neq(a, b)
    ]);

    // 特殊处理：需要映射成 Go 辅助函数的运算符
    const specialMap = new Map<ts.SyntaxKind, string>([
        [ts.SyntaxKind.InstanceOfKeyword, "ts.G_instanceof"], // 同上，转成辅助函数
        [ts.SyntaxKind.InKeyword, "ts.G_in"],           // Go 没有 in，我们后面会转成辅助函数
        [ts.SyntaxKind.EqualsEqualsToken, "ts.G_looseEq"],          // JS ==  → Go ==
        [ts.SyntaxKind.ExclamationEqualsToken, "G_looseNeq"],       // JS !=  → Go !=
        [ts.SyntaxKind.PlusToken, "ts.G_add"],     // + 字符串拼接 → ts.G_add
        [ts.SyntaxKind.QuestionQuestionToken, "ts.G_coalesce"],// ?? → ts.G_coalesce
        [ts.SyntaxKind.InstanceOfKeyword, "ts.G_instanceof"],
    ]);

    // 1. 先看是否要走特殊映射（===、!==、+、??、in、instanceof）
    if (specialMap.has(kind)) {
        const fn = specialMap.get(kind)!;
        return {code: `${fn}(${left},${right})`};   // 返回函数名，外面会拼成 ts.G_eq(left, right)
    }

    // 2. 直接映射的普通运算符
    if (directMap.has(kind)) {
        return {code: `${left} ${directMap.get(kind)!} ${right}`};
    }

    // 3. 没见过的（理论上不应该走到这里）
    return {
        code: text,
    };
}

function parseBinaryExpression(expression: BinaryExpression) {
    const left = parseExpression(expression.getLeft());
    const right = parseExpression(expression.getRight());
    const op = expression.getOperatorToken();
    return {
        code: parseOperatorToken(op, left.code, right.code).code
    }
}

function isFunctionLike(node: Node) {
    return Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isFunctionDeclaration(node) || Node.isMethodDeclaration(node);
}

function parseFunctionLike(node: ArrowFunction | FunctionExpression | FunctionDeclaration | MethodDeclaration | ConstructorDeclaration): CodeResult {
    const isExport = node.hasModifier(ts.SyntaxKind.ExportKeyword)
    const parameters = node.getParameters();
    const args = parseParameters(parameters).code;
    const body = parseBody(node.getBody());
    const returnType = parseType(node.getReturnType());
    let name: string = '';
    if (!Node.isArrowFunction(node)) {
        if (Node.isConstructorDeclaration(node)) {
            name = 'constructor'
        } else {
            name = node.getName() || "";
        }
    }

    if (Node.isMethodDeclaration(node)) {
        return {
            code: `G_${name}= func (${args}) ${returnType} ${body.code}`,
            type: `G_${name} func (${args}) ${returnType}`
        }
    }
    return {
        code: `func ${isExport ? 'G_' : ''}${name}(${args}) ${returnType} ${body.code}`,
        type: `func ${isExport ? 'G_' : ''}${name}(${args}) ${returnType}`
    }
}

function parseExpression(expression?: Expression): CodeResult {

    if (!expression) {
        return {code: ''}
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
    } else if (Node.isObjectLiteralExpression(expression)) {
        return parseObjectLiteralExpression(expression)
    } else if (Node.isPostfixUnaryExpression(expression)) {
        return parsePostfixUnaryExpression(expression)
    } else if (Node.isFunctionExpression(expression)) {
        return parseFunctionLike(expression);
    } else if (Node.isArrayLiteralExpression(expression)) {
        return parseArrayLiteralExpression(expression)
    } else if (Node.isUnaryExpression(expression)) {
        return parseUnaryExpression(expression)
    }
    return {code: ''}
}

function parseNewExpression(expression: NewExpression): CodeResult {
    const exp = expression.getExpression();
    let name: string = '';
    if (Node.isIdentifier(exp)) {
        name = parseIdentifier(exp).code
    }
    const args = expression.getArguments();
    const argsStr = args.map(arg => parseNode(arg).code).join(',');
    return {code: `new(${name}).Constructor(${argsStr})`}
}

function parseUnaryExpression(expression: UnaryExpression) {
    if (Node.isPrefixUnaryExpression(expression)) {
        return parsePrefixUnaryExpression(expression)
    }
    if (Node.isNewExpression(expression)) {
        return parseNewExpression(expression)
    }
    return {code: expression.getText()}
}

function parseArrayLiteralExpression(exp: ArrayLiteralExpression) {
    const type = exp.getType();
    const elements = exp.getElements();
    const EType = type.getArrayElementType()
    const eleType = EType ? parseType(EType) : 'ts.Any'
    const res = `ts.Array[${eleType}]{${elements.map(ele => parseExpression(ele).code)}}`
    return {code: res}
}

function parsePostfixUnaryExpression(exp: PostfixUnaryExpression) {
    const left = exp.getOperand();
    const leftResult = parseLeftHandSideExpression(left)
    const token = exp.getOperatorToken();
    return {code: `${leftResult.code}${token === SyntaxKind.PlusPlusToken ? "++" : "--"}`}
}

function parseObjectLiteralExpression(expression: ObjectLiteralExpression) {

    const parent = expression.getParent();
    const block = parent.getParent();
    const fun = block?.getParent();
    if (Node.isReturnStatement(parent) && fun && isFunctionLike(fun)) {
        let returnType = (fun as FunctionDeclaration).getReturnType();
        let returnTypeStr = returnType.getText();
        const properties = expression.getProperties();
        return {
            code: `&${returnTypeStr}{\n\t${properties.map((p) => {
                return parseObjectLiteralElementLike(p).code.split('\n').join('\n\t')
            }).join(',\n\t')},\n}`
        }
    }
    return {code: ''}
}

function parseObjectLiteralElementLike(node: ObjectLiteralElementLike) {
    if (Node.isPropertyAssignment(node)) {
        return parsePropertyAssignment(node);
    } else if (Node.isShorthandPropertyAssignment(node)) {

    } else if (Node.isSpreadAssignment(node)) {

    } else if (Node.isMethodDeclaration(node)) {
        return parseFunctionLike(node);
    } else if (Node.isPropertyAccessExpression(node)) {

    }
    return {code: ''}
}

function parsePropertyAssignment(node: PropertyAssignment) {
    const name = node.getName();
    const initializer = node.getInitializer();

    return {code: `G_${name}: ${parseExpression(initializer).code}`}
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
        return parseIdentifier(expression)
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

function parseExportAssignment(node: ExportAssignment) {
    let name = 'default';
    const expression = node.getExpression();
    const declaration = expression.getSymbol()!.getDeclarations()[0]!;
    const isExport = declaration.getCombinedModifierFlags() === ts.ModifierFlags.Export
    return {code: `var G_${name} = ${(isExport ? 'G_' : "") + expression.getText()}`}
}

function parseExpressionStatement(node: ExpressionStatement) {
    const res = parseExpression(node.getExpression());
    const parent = node.getParent();
    const isSourceFile = Node.isSourceFile(parent)
    return {
        code: `${isSourceFile ? `var _exp${expId++} = ` : ""}${res.code}`
    }
}

function parseNode(node: Node): CodeResult {
    if (Node.isIdentifier(node)) {
        return parseIdentifier(node)
    } else if (Node.isVariableStatement(node)) {
        return parseVariableStatement(node);  // 检查 statement 是否是导出的
    } else if (Node.isVariableDeclarationList(node)) {
        return parseVariableDeclarationList(node)
    } else if (Node.isFunctionDeclaration(node)) {
        return parseFunctionLike(node)
    } else if (Node.isExpressionStatement(node)) {
        return parseExpressionStatement(node)
    } else if (Node.isExpression(node)) {
        return parseExpression(node)
    } else if (Node.isExportAssignment(node)) {
        return parseExportAssignment(node)
    } else if (Node.isIfStatement(node)) {
        return parseIfStatement(node)
    } else if (Node.isForStatement(node)) {
        return parseForStatement(node)
    } else if (Node.isBlock(node)) {
        return parseBlock(node)
    } else if (Node.isImportDeclaration(node)) {
        return parseImportDeclaration(node)
    } else if (Node.isReturnStatement(node)) {
        return parseReturnTyped(node)
    } else if (Node.isTypeAliasDeclaration(node)) {
        return parseTypeAliasDeclaration(node)
    } else if (Node.isClassDeclaration(node)) {
        return parseClassDeclaration(node)
    } else if (Node.isParameterDeclaration(node)) {
        return parseParameterDeclaration(node)
    }
    return {
        code: node.getText()
    }
}

function parseParameterDeclaration(node: ParameterDeclaration) {
    const name = node.getName();
    let type = node.getType();
    const initializer = node.getInitializer();
    //todo
    if (!type && initializer) {
        type = initializer.getType();
    }
    return {
        code: `${name} ${parseType(type)}`
    }
}

function parsePropertyDeclaration(node: PropertyDeclaration) {
    const name = node.getName();
    const initializer = node.getInitializer();
    const type = node.getType();
    return {
        code: `${name}:${parseExpression(initializer).code} `,
        type: `${name} ${parseType(type)}`
    }
}

function parseClassMembers(node: ClassMemberTypes) {
    if (Node.isPropertyDeclaration(node)) {
        return parsePropertyDeclaration(node)
    } else if (Node.isMethodDeclaration(node)) {
        const res = parseFunctionLike(node)
        return {
            code: res.code.split('\n').join('\n\t'),
            type: res.type
        }
    } else if (Node.isConstructorDeclaration(node)) {
        return {code: ""}
    }
    return {
        code: node.getText()
    }
}

function parseClassDeclaration(node: ClassDeclaration) {
    const name = parseIdentifier(node.getNameNode()!).code
    const members = node.getMembers();
    const contentTypes = members.map(m => parseClassMembers(m).type).join('\n\t')
    const variable: string[] = [];
    const fn: string[] = []
    members.flatMap(m => {
        const val = parseClassMembers(m).code;
        if (Node.isPropertyDeclaration(m)) {
            variable.push(val)
        }
        if (Node.isMethodDeclaration(m)) {
            fn.push(val)
        }
        return val ? [val] : []
    }).join(',\n\t')
    const cn = members.find(m => Node.isConstructorDeclaration(m))
    const args = cn?.getParameters() || [];
    const argStr = args.map(arg => parseNode(arg).code).join(',')
    return {
        code: `type ${name} struct {\n\t${contentTypes}\n}\n\nfunc (g *${name}) Constructor(${argStr}) *${name} {\n\t${cn ? parseBody(cn.getBody()).code : ""}\n this:=&${name}{\n\t${variable.join(',\n\t')},\n} \n${fn.map(f => `this.${f}`).join('\n')}\n return this\n}`
    }
}

function parsePrefixUnaryExpression(node: PrefixUnaryExpression) {
    const operand = parseExpression(node.getOperand());
    const token = node.getOperatorToken();
    let code = '';
    switch (token) {
        case SyntaxKind.PlusPlusToken:   // ++x
            code = `++${operand.code}`;
            break;
        case SyntaxKind.MinusMinusToken:  // --x
            code = `--${operand.code}`;
            break;
        case SyntaxKind.PlusToken:        // +x
            code = `+${operand.code}`;
            break;
        case SyntaxKind.MinusToken:       // -x
            code = `-${operand.code}`;
            break;
        case SyntaxKind.TildeToken:       // ~x
            code = `~${operand.code}`;
            break;
        case SyntaxKind.ExclamationToken: // !x
            code = `!${operand.code}`;
            break;
        default:
            throw new Error(`Unsupported prefix unary operator: ${token}`);
    }
    return {
        code
    }
}

function parseTypeLiteral(node: TypeLiteralNode) {
    const ms = node.getMembers();
    let lines: string[] = [];
    ms.forEach(m => {
        if (Node.isPropertySignature(m)) {
            const name = m.getName();
            const typeNode = m.getTypeNode();
            const goType = typeNode ? parseType(typeNode.getType()) : "Any";

            lines.push(`G_${name} ${goType}`);
        } else if (Node.isMethodSignature(m)) {
            const name = m.getName();
            const params = m.getParameters();
            const returnType = m.getReturnTypeNode();

            // 参数转换
            const goParams = params
                .map((p) => {
                    const pType = p.getTypeNode();
                    return `${p.getName()} ${pType ? parseType(pType.getType()) : "Any"}`;
                })
                .join(", ");

            // 返回类型转换
            const goReturn = returnType
                ? parseType(returnType.getType())
                : "";

            // 方法签名：不写实现，只写定义
            lines.push(
                `G_${name} func (${goParams}) ${goReturn}`
            );
        }
    })
    return {
        code: `struct {\n\t${lines.join('\n\t')}\n}`
    }
}

function parseTypeAliasDeclaration(node: TypeAliasDeclaration) {
    const name = node.getName();

    const typeNode = node.getTypeNode();
    let val = '';
    if (Node.isTypeLiteral(typeNode)) {
        val = parseTypeLiteral(typeNode).code
    } else {
        val = parseType(node.getType())
    }
    return {
        code: `type ${name} ${val}`
    }
}

function parseReturnTyped(node: ReturnStatement) {
    const exp = node.getExpression();
    let content = `ts.Undefined{}`
    if (exp) {
        content = parseExpression(exp).code;
    }
    return {
        code: `\nreturn ${content}`
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
            code: `{\n\treturn ${exprCode.code}\n}`
        }
    }
    res.code = parseBlock(body).code
    return res;
}

function parseBlock(block: Block): CodeResult {
    const content = block.getStatements().map(s => {
        const code = parseStatement(s).code;
        return `${code.split('\n').join('\n\t')}`
    }).join(';')
    const parent = block.getParent()
    const returned = isFunctionLike(parent) && !hasReturn(block)
    return {
        code: `{\n\t${content}${returned ? `\n\treturn ts.Undefined{}` : ""}\n}`
    }
}


function parseDeclarationKind(kind: VariableDeclarationKind) {
    switch (kind) {
        case VariableDeclarationKind.Var:
            return 'var'
        case VariableDeclarationKind.Let:
            return 'var'
        case VariableDeclarationKind.Const:
            return 'var'
    }
    return kind.toString()
}

function parseFunctionType(type: Type) {
    const symbol = type.getSymbol() || type.getAliasSymbol();
    if (!symbol) return "ts.Any";

    const declarations = symbol.getDeclarations();
    const node = declarations[0] as FunctionDeclaration;
    return `func(${node.getParameters().map(p => parseType(p.getType())).join(', ')}) ${parseType(node.getReturnType())}`
}

function parseType(type: Type): string {

    // 1. 基本类型（优先匹配）
    if (type.isNumber() || type.isNumberLiteral()) return "ts.Number";
    if (type.isString() || type.isStringLiteral()) return "ts.String";
    if (type.isBoolean() || type.isBooleanLiteral()) return "ts.Boolean";
    if (type.isNull()) return "ts.Null";
    if (type.isUndefined() || type.isVoid()) return "ts.Undefined";

    // 2. 特殊类型
    if (type.isAny() || type.isUnknown()) return "ts.Any";
    if (type.isNever()) return "ts.Any"; // 一般不会出现
    if (type.isObject()) {
        // 继续往下走
    }
    // 2. 函数类型核心判断（关键！）
    if (isFunctionType(type)) {
        return parseFunctionType(type);
    }

    // 3. 联合类型 | 交叉类型 → 都降级成 Any
    if (type.isUnionOrIntersection()) {
        // 可选：你可以尝试解析简单联合，如 string | number → Any
        return "ts.Any";
    }

    // 4. 数组类型 number[] 或 Array<string>
    if (type.isArray()) {
        const elementType = type.getArrayElementType()!;
        const eleTypeStr = elementType ? parseType(elementType) : "ts.Any"
        return `ts.Array[${eleTypeStr}]`; // 你的 Array 类型
    }

    // 5. 获取底层 symbol（关键！）
    const symbol = type.getSymbol() || type.getAliasSymbol();
    if (!symbol) {
        return "ts.Any"; // 无法解析的复杂类型
    }

    const symbolName = symbol.getName();

    // 6. 内置类型别名（如 Promise、Record 等）
    /*    if (symbolName === "Promise") return "Any"; // async 函数返回 Any
        if (symbolName === "Date") return "Any"; // 你可以加 Date 类型
        if (symbolName === "RegExp") return "Any";*/

    // 7. 用户定义的 type alias、interface、class、enum
    const declarations = symbol.getDeclarations();
    if (declarations.length === 0) return "ts.Any";

    const decl = declarations[0];

    // 7.1 类型别名 type User = { name: string }
    if (Node.isTypeAliasDeclaration(decl)) {
        const typeName = decl.getName();

        // 推荐：你给每个 type 别名生成一个 struct
        return `*${typeName}`; // 或直接返回 typeName 包名
    }

    // 7.2 接口 interface Person { name: string }
    if (Node.isInterfaceDeclaration(decl)) {
        const interfaceName = decl.getName();
        return `*${interfaceName}`;
    }

    // 7.3 类 class Animal { name: string }
    if (Node.isClassDeclaration(decl)) {
        const className = decl.getName() || "AnonymousClass";
        return `*${className}`;
    }

    // 7.4 枚举 enum Color { Red, Green }
    if (Node.isEnumDeclaration(decl)) {
        return "Number"; // 你的 enum 编译成 Number
    }
    if (Node.isTypeLiteral(decl.getType().getSymbol()?.getDeclarations()[0])) {
        return `*${type.getText()}`;
    }

    // 8. __type、__object 等特殊标记（ts-morph 内部）
    if (symbolName === "__type" || symbolName === "__object") {

        return "Object";
    }

    // 9. 默认降级
    return "ts.Any";
}