package demo
import ts "github.com/robertpanvip/ts2go/core"
var G_a ts.Number = ts.Number(123);
func G_expose() ts.Number {
	ts.Global.G_console.G_log(G_a);return ts.Number(89)
}
var G_default = G_expose
