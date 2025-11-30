import {Statement, Node, Block} from "ts-morph";

export function hasReturn(block: Block) {
    return hasReturnDeep(block.getStatements())
}

/**
 * 更彻底的版本：递归遍历所有嵌套语句（防止 return 藏在 if/for 里）
 */
export function hasReturnDeep(statements: readonly Statement[]): boolean {
    for (const stmt of statements) {
        if (Node.isReturnStatement(stmt)) {
            return true;
        }

        // 递归检查嵌套块：if、for、while、do、try/catch、block 等
        if (Node.isBlock(stmt) ||
            Node.isIfStatement(stmt) ||
            Node.isForStatement(stmt) ||
            Node.isForInStatement(stmt) ||
            Node.isForOfStatement(stmt) ||
            Node.isWhileStatement(stmt) ||
            Node.isDoStatement(stmt) ||
            Node.isTryStatement(stmt)) {
            const childBlocks: Block[] = [];

            // 收集所有可能的子块
            if (Node.isBlock(stmt)) childBlocks.push(stmt as Block);
            if (Node.isIfStatement(stmt)) {
                const thenStmt = stmt.getThenStatement();
                const elseStmt = stmt.getElseStatement();
                if (Node.isBlock(thenStmt)) childBlocks.push(thenStmt as Block);
                if (elseStmt && Node.isBlock(elseStmt)) childBlocks.push(elseStmt as Block);
            }
            if (Node.isTryStatement(stmt)) {
                const tryBlock = stmt.getTryBlock();
                const catchClause = stmt.getCatchClause();
                const finallyBlock = stmt.getFinallyBlock();
                if (tryBlock) childBlocks.push(tryBlock);
                if (catchClause?.getBlock()) childBlocks.push(catchClause.getBlock());
                if (finallyBlock) childBlocks.push(finallyBlock);
            }
            // 其他循环语句类似...

            // 递归检查子块
            for (const block of childBlocks) {
                if (hasReturnDeep(block.getStatements())) {
                    return true;
                }
            }
        }
    }
    return false;
}