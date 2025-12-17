
package runtime
import (
    "fmt"
    "strings"
    "time"
)
// G_console 结构体
type ConsoleConstructor struct {
    G_log    Function
    G_time     Function // console.time(label string)
    G_timeEnd  Function // console.timeEnd(label string)
    timers   map[String]time.Time // 内部存储定时器
}

func (g *ConsoleConstructor) Constructor() *ConsoleConstructor {
     this:= &ConsoleConstructor{
        timers: make(map[String]time.Time),
     }

    this.G_log = func(args ...Any) Any {
            parts := make([]string, len(args))
            for i, a := range args {
                parts[i] = string(G_toString(a))
            }
            fmt.Println(strings.Join(parts, " "))
            return nil
    }

    this.G_time = func(args ...Any) Any {
            if len(args) == 0 {
                this.G_log("console.time: 需要提供 label")
                return nil
            }
            label := G_toString(args[0])
            if len(args) > 1 {
                label = G_toString(args[0]) // 只取第一个参数作为 label（类似 JS 默认 "default"）
            }
            this.timers[label] = time.Now()
            return nil
    }

    this.G_timeEnd = func(args ...Any) Any {
            label := String("default")
            if len(args) > 0 {
                label = G_toString(args[0])
            }
            start, ok := this.timers[label]
            if !ok {
                this.G_log("console.timeEnd:", label, ": 没有找到对应的 timer")
                return nil
            }
            elapsed := time.Since(start)
            this.G_log(label + ":", fmt.Sprintf("%.3fns", float64(elapsed.Nanoseconds())))
            delete(this.timers, label) // 可选：清理
            return nil
    }
    return this
}

var Console  *ConsoleConstructor = new(ConsoleConstructor).Constructor()