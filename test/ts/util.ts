import {expose} from './demo'

export let ac = 123;

export function test(x: number | string) {
    if (typeof x === 'string') {
        console.log(x)
    } else {
        console.log(x + 1)
    }
}

const parseX:Function=()=> {

}
const x= parseX('1')
const a="1";
console.log(a)
export default test;
