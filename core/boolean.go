package runtime

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

type Boolean bool


// ====================== Boolean ======================
func (b Boolean) G_toString() String {
	if b {
		return "true"
	}
	return "false"
}
func (b Boolean) G_valueOf() Boolean { return b }

func (b Undefined) G_toString() String {
	return "undefined"
}

func (b Null) G_toString() String {
	return "null"
}

func (b Symbol) G_toString() String {
	return "Symbol(" + b.val +")"
}

func (b Symbol) G_for(val String) String {
	return "Symbol(" + val +")"
}