import {expose} from './demo'

export let ac = 123;

export function test(x: number | string) {
    if (typeof x === 'string') {
        console.log(x)
    } else {
        console.log(x + 1)
    }
}

type As = { a: number, foo(x: number): string; b: number };

function getAs(): As {
    return {
        a: 2,
        b: 1,
        foo(x: number) {
            return "222"
        }
    }
}

const x: As = getAs()
const a = "1";

function main() {
    console.log(a)
}

//export default test;
