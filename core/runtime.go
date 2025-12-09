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

type Null     struct{}  // null 的专用类型
type Undefined struct{} // undefined 的专用类型
type Symbol struct{ val String } // Symbol 的专用类型
type Object struct{} // Object 的专用类型

type Function func(args ...Any) Any


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

