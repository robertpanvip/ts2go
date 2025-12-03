package main
import ts "github.com/robertpanvip/ts2go/core"
import demo "github.com/robertpanvip/ts2go/test/go/demo"
var G_expose = demo.G_expose

var G_ac ts.Number = ts.Number(123);
func G_test(x ts.Any) ts.Undefined {
	if ts.G_typeof(x) == ts.String("string") {
		ts.Global.G_console.G_log(x.(ts.String))
	} else {
		ts.Global.G_console.G_log(ts.G_add(x.(ts.Number),ts.Number(1)))
	}
	return ts.Undefined{}
}
type As struct {
	G_a ts.Number
	G_foo func (x ts.Number) ts.String
	G_b ts.Number
}
func getAs() *As {
	return &As{
		G_a: ts.Number(2),
		G_b: ts.Number(1),
		G_foo: func (x ts.Number) ts.String {
			return ts.String("222")
		},
	}
}
var x *As = getAs();
var a ts.String = ts.String("1");
func main() {
	ts.Global.G_console.G_log(a)
}
