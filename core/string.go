package runtime

import (
	"strings"
	"unicode"
)

type String string


func (s String) G_concat(args ...Any) String {
	b := strings.Builder{}
	b.WriteString(string(s))
	for _, a := range args {
		b.WriteString(string(G_toString(a)))
	}
	return String(b.String())
}

func (s String) G_slice(start Number, end ...Number) String {
	runes := []rune(string(s))
	begin := G_norm(int(start), len(runes))
	e := len(runes)
	if len(end) > 0 {
		e = G_norm(int(end[0]), len(runes))
	}
	if begin > e {
		begin, e = e, begin
	}
	return String(string(runes[begin:e]))
}

func (s String) G_substring(start Number, end ...Number) String {
	a := int(start)
	b := len([]rune(string(s)))
	if len(end) > 0 {
		b = int(end[0])
	}
	if a < 0 {
		a = 0
	}
	if b < 0 {
		b = 0
	}
	if a > b {
		a, b = b, a
	}
	return s.G_slice(Number(a), Number(b))
}

func (s String) G_toLowerCase() String { return String(strings.ToLower(string(s))) }
func (s String) G_toUpperCase() String { return String(strings.ToUpper(string(s))) }
func (s String) G_trim() String        { return String(strings.TrimSpace(string(s))) }
func (s String) G_trimStart() String   { return String(strings.TrimLeftFunc(string(s), unicode.IsSpace)) }
func (s String) G_trimEnd() String     { return String(strings.TrimRightFunc(string(s), unicode.IsSpace)) }