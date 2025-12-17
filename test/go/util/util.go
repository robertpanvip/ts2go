package util
import ts "github.com/robertpanvip/ts2go/core"
type A struct {
	G_fieldA ts.Number
	
	G_method func (arg ts.Number) ts.Undefined
}

func (g *A) Constructor(a ts.Number) *A {
	{
	ts.Global.G_console.G_log(a)
}
 this:=&A{
	G_fieldA:ts.Number(123) ,
} 
this.G_method= func (arg ts.Number) ts.Undefined {
		ts.Global.G_console.G_log(this.G_fieldA)
		return ts.Undefined{}
	}
 return this
}
var a  *A = new(A).Constructor(ts.Number(456))
var _exp0 = a.G_method(ts.Number(2222))
