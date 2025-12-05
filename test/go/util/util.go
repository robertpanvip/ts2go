package util
import ts "github.com/robertpanvip/ts2go/core"
var multiply  func(ts.Number, ts.Number) ts.Number = func (a ts.Number,b ts.Number) ts.Number {
	return a * b
}
