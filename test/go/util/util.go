package util
import ts "github.com/robertpanvip/ts2go/core"
var array  ts.Array[ts.Number] = ts.Array[ts.Number]{ts.Number(1),ts.Number(2),ts.Number(3),ts.Number(4),ts.Number(5)}
var _exp0 = array.G_map(func (item ts.Number) ts.Undefined {
	ts.Global.G_console.G_log(item)
	return ts.Undefined{}
})
