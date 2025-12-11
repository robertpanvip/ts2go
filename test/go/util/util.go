package util
import ts "github.com/robertpanvip/ts2go/core"
type struct G_A{
	fieldA ts.Number
	
	G_method func (arg ts.Number) ts.Undefined
}

func (g *G_A) Constructor(a ts.Number) {
	{
	ts.Global.G_console.G_log(a)
}return struct{
	fieldA:ts.Number(123) 
	
	G_method: func (arg ts.Number) ts.Undefined {
		ts.Global.G_console.G_log(this.fieldA)
	}}
}
var a  &A{} = G_A.Constructor(ts.Number(456))
