package runtime
import (
	"fmt"
	"strings"
)
// 引用值
type Array[T any] []T
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
/* func (a Array[T]) G_map[U any](fn func(value T, index Number) U) Array[U] {
    // 创建一个 U 类型的切片
    res := make(Array[U], len(a))

    // 遍历并应用转换函数
    for i, v := range a {
       // 🚀 修正点：将 int(i) 显式转换为 Number (int64)
       res[i] = fn(v, Number(i))
    }

    // 返回一个新的 Array[U]
    return res
} */

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