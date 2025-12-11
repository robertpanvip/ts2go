class A{
    fieldA:number=123;
    constructor(a:number){
    console.log(a)
    }
    method(arg:number):void{
        console.log(this.fieldA);
    }
}
const a = new A(456);
