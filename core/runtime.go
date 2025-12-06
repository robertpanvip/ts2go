package runtime

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// ====================== 基础类型 ======================
type Any = any

type Number int64
type String string
type Boolean bool
type Null     struct{}  // null 的专用类型
type Undefined struct{} // undefined 的专用类型
type Symbol struct{ val String } // Symbol 的专用类型
type Object struct{} // Object 的专用类型

type Function func(args ...Any) Any
// 引用值
type Array[T any] []T

func G_typeof(x Any) String {
    if x == nil {
        return "undefined"
    }
	switch x.(type) {
	case Number:
		return "number"
	case String:
		return "string"
	case Boolean:
		return "boolean"
	case Null:
		return "object"
	case Undefined:
		return "undefined"
	case Symbol:
		return "symbol"
	case Object:
		return "object"
    case Function:
        return "function"
    }
    return "object"
}



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
// ====================== 全局对象：彻底重构（全 G_ 风格 + 新 Function）======================
 var Global = struct {
     G_NaN      Number
     G_Infinity Number

     G_parseInt   Function
     G_parseFloat Function
     G_isNaN      Function
     G_isFinite   Function

     G_console struct {
         G_log Function
     }
 }{
     G_NaN:      Number(math.NaN()),
     G_Infinity: Number(math.Inf(1)),

     // parseInt(string: String, radix?: Number) → Number
     G_parseInt: func(args ...Any) Any {
         if len(args) == 0 {
             return Number(math.NaN())
         }
         str := strings.TrimSpace(string(G_toString(args[0])))
         radix := 10
         if len(args) > 1 {
             r := int(G_toNumber(args[1]))
             if r >= 2 && r <= 36 {
                 radix = r
             }
         }
         if i, err := strconv.ParseInt(str, radix, 64); err == nil {
             return Number(i)
         }
         return Number(math.NaN())
     },

     // parseFloat(string: String) → Number
     G_parseFloat: func(args ...Any) Any {
         if len(args) == 0 {
             return Number(math.NaN())
         }
         if f, err := strconv.ParseFloat(strings.TrimSpace(string(G_toString(args[0]))), 64); err == nil {
             return Number(f)
         }
         return Number(math.NaN())
     },

     // isNaN(value: Any) → Boolean
     G_isNaN: func(args ...Any) Any {
         if len(args) == 0 {
             return Boolean(true)
         }
         return Boolean(math.IsNaN(float64(G_toNumber(args[0]))))
     },

     // isFinite(value: Any) → Boolean
     G_isFinite: func(args ...Any) Any {
         if len(args) == 0 {
             return Boolean(false)
         }
         n := G_toNumber(args[0])
         return Boolean(!math.IsNaN(float64(n)) && !math.IsInf(float64(n), 0))
     },

     // console.log(...args)
     G_console: struct {
         G_log Function
     }{
         G_log: func( args ...Any) Any {
             parts := make([]string, len(args))
             for i, a := range args {
                 parts[i] = string(G_toString(a))
             }
             fmt.Println(strings.Join(parts, " "))
             return nil
         },
     },
 }

// ====================== 强制转换函数（也加 G_）======================
func G_toString(v Any) String {
	switch x := v.(type) {
	case String:
		return x
	case Number:
		return x.G_toString()
	case Boolean:
		return x.G_toString()
	case Null:
        return x.G_toString()
    case Undefined:
        return x.G_toString()
	case nil:
		return "null"
	case Function:
		return "Function"
	default:
		return String(fmt.Sprintf("%v", v))
	}
}

func G_toNumber(v Any) Number {
	switch x := v.(type) {
	case Number:
		return x
	case String:
		if f, err := strconv.ParseFloat(strings.TrimSpace(string(x)), 64); err == nil {
			return Number(f)
		}
		return Number(math.NaN())
	case Boolean:
		if x {
			return Number(1)
		}
		return Number(0)
	case nil:
		return Number(0)
	default:
		return Number(math.NaN())
	}
}

func G_toBoolean(v Any) Boolean {
	switch x := v.(type) {
	case Boolean:
		return x
	case Number:
        return Boolean(x != 0 && !math.IsNaN(float64(x)))
	case String:
		return len(x) > 0
	case nil:
		return false
	default:
		return true
	}
}


// ====================== 辅助函数（私有，不导出）======================
func G_norm(i, length int) int {
	if i < 0 {
		i += length
	}
	if i < 0 {
		return 0
	}
	if i > length {
		return length
	}
	return i
}


func G_looseEq(a, b Any) bool {
    switch x := a.(type) {
    case Number:
        switch y := b.(type) {
        case Number:   return x == y
        case String:   return String(x) == String(y) // "123" == 123 → true
        case bool:        return (x != 0) == y
        }
    case String:
        if y, ok := b.(Number); ok {
            return String(x) == String(y)
        }
    case bool:
        if y, ok := b.(Number); ok {
            return (y != 0) == x
        }
    }
    return a == b // 兜底
}

func G_looseNeq(a, b Any) bool {
    return !G_looseEq(a, b)
}

// G_add 完全实现 JavaScript 的 + 运算符规则（ToPrimitive + ToString 拼接优先）
// 对应 JS 的：  any + any
func G_add(a, b Any) Any {
    // 1. 如果任一方是 string → 强制转成字符串拼接
    if isString(a) || isString(b) {
        return a.(String) + b.(String)
    }

    // 2. 否则都尝试转成 number 相加
    n1 := toNumber(a)
    n2 := toNumber(b)

    // NaN + anything = NaN
    if math.IsNaN(float64(n1)) || math.IsNaN(float64(n2)) {
        return Number(math.NaN())
    }

    return Number(n1 + n2)
}

// toNumber 模拟 JS 的 ToNumber 转换
func toNumber(v any) Number {
    switch x := v.(type) {
    case Number:
        return Number(x)
    case String:
        // 模仿 JS 解析：空字符串 → 0，"  123.45  " → 123.45，非法 → NaN
        s := String(x)
        if s == "" {
            return Number(0)
        }
        f, err := strconv.ParseFloat(string(s), 64)
        if err != nil {
            return Number(math.NaN())
        }
        return Number(f)
    case Boolean:
        if x {
            return Number(1)
        }
        return Number(0)
    case nil:
        return Number(0)
    case Undefined:
        return Number(math.NaN())
    default:
        return Number(math.NaN())
    }
}
// isString 判断是否为 ts.String 类型（避免反射开销）
func isString(v Any) bool {
    _, ok := v.(String)
    return ok
}

// 基础方法：用值接收器
// 长度
func (a Array[T]) G_length() Number {
	return Number(len(a))
}

// 获取
func (a Array[T]) G_get(i Number) T {
	return a[i]
}

// 设置
func (a Array[T]) G_set(i Number, v T) Undefined {
	a[i] = v
	return Undefined{}
}

// at 支持负数下标
func (a Array[T]) G_at(i Number) T {
	idx := int(i)
	if idx < 0 {
		idx = len(a) + idx
	}
	if idx < 0 || idx >= len(a) {
		var zero T
		return zero
	}
	return a[idx]
}

// ----------------------
// 修改数组的方法 (指针接收者)
// ----------------------

// Push
func (a *Array[T]) G_push(v T) Undefined {
	*a = append(*a, v)
	return Undefined{}
}

// Pop
func (a *Array[T]) G_pop() T {
	if len(*a) == 0 {
		var zero T
		return zero
	}
	last := (*a)[len(*a)-1]
	*a = (*a)[:len(*a)-1]
	return last
}

// Shift
func (a *Array[T]) G_shift() T {
	if len(*a) == 0 {
		var zero T
		return zero
	}
	first := (*a)[0]
	*a = (*a)[1:]
	return first
}

// Unshift
func (a *Array[T]) G_unshift(v T) Undefined {
	*a = append([]T{v}, *a...)
	return Undefined{}
}

// Remove
func (a *Array[T]) G_remove(i Number) Undefined {
	idx := int(i)
	if idx < 0 || idx >= len(*a) {
		return Undefined{}
	}
	*a = append((*a)[:idx], (*a)[idx+1:]...)
	return Undefined{}
}

// Splice：删除 deleteCount 个元素并插入 items
func (a *Array[T]) G_splice(start Number, deleteCount Number, items ...T) Undefined {
	aa := *a
	s := int(start)
	if s < 0 {
		s = 0
	}
	if s > len(aa) {
		s = len(aa)
	}
	e := s + int(deleteCount)
	if e > len(aa) {
		e = len(aa)
	}
	newA := append(append(aa[:s], items...), aa[e:]...)
	*a = newA
	return Undefined{}
}

// ----------------------
// 遍历 / 高阶函数
// ----------------------

// ForEach
func (a *Array[T]) G_forEach(fn func(value T, index Number)) Undefined {
    for i, v := range *a {
       // 修正点：将 int(i) 显式转换为 Number (int64)
       fn(v, Number(i))
    }
   return Undefined{}
}

// G_map：T 映射到 U，返回新的 Array[U]
func (a Array[T]) G_map[U any](fn func(value T, index Number) U) Array[U] {
    // 创建一个 U 类型的切片
    res := make(Array[U], len(a))

    // 遍历并应用转换函数
    for i, v := range a {
       // 🚀 修正点：将 int(i) 显式转换为 Number (int64)
       res[i] = fn(v, Number(i))
    }

    // 返回一个新的 Array[U]
    return res
}

// Filter
func (a *Array[T]) G_filter(fn func(value T, index int) bool) *Array[T] {
	res := &Array[T]{}
	for i, v := range *a {
		if fn(v, i) {
			*res = append(*res, v)
		}
	}
	return res
}

// ----------------------
// 特殊方法
// ----------------------

// Join
func (a Array[T]) G_join(sep String) String {
	if len(a) == 0 {
		return ""
	}
	var sb strings.Builder
	for i, v := range a {
		if i > 0 {
			sb.WriteString(string(sep))
		}
		sb.WriteString(fmt.Sprint(v))
	}
	return String(sb.String())
}
