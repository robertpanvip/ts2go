package runtime

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

type Number int64

// ====================== Number ======================
func (n Number) G_toFixed(fractionDigits Number) String {
	d := int(fractionDigits)
	if d < 0 {
		d = 0
	}
	if d > 20 {
		d = 20
	}
	return String(fmt.Sprintf("%.*f", d, float64(n)))
}

func (n Number) G_toExponential(fractionDigits Number) String {
	d := int(fractionDigits)
	if d < 0 || d > 20 {
		d = 20
	}
	return String(fmt.Sprintf("%.*e", d, float64(n)))
}

func (n Number) G_toPrecision(precision Number) String {
	p := int(precision)
	if p < 1 || p > 21 {
		return n.G_toString()
	}
	return String(fmt.Sprintf("%.*g", p, float64(n)))
}

func (n Number) G_toString(radix ...Number) String {
	r := 10
	if len(radix) > 0 {
		if rdx := int(radix[0]); rdx >= 2 && rdx <= 36 {
			r = rdx
		}
	}
	return String(strconv.FormatInt(int64(n), r))
}

func (n Number) G_valueOf() Number { return n }

// ====================== String ======================
func (s String) G_length() Number { return Number(utf8.RuneCountInString(string(s))) }

func (s String) G_toString() String { return s }
func (s String) G_valueOf() String  { return s }

func (s String) G_charAt(pos Number) String {
	runes := []rune(string(s))
	i := int(pos)
	if i < 0 || i >= len(runes) {
		return ""
	}
	return String(runes[i])
}

func (s String) G_charCodeAt(pos Number) Number {
	runes := []rune(string(s))
	i := int(pos)
	if i < 0 || i >= len(runes) {
		return Number(math.NaN())
	}
	return Number(runes[i])
}
