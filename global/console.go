// global/console.go
package global

import (
	"fmt"
	"os"
	"time"
)

type Console struct{} // 直接使用 Console 作为类型名

var timers = make(map[string]time.Time)

func (c *Console) Log(v ...interface{}) {
	fmt.Println(v...)
}

func (c *Console) Error(v ...interface{}) {
	fmt.Fprintln(os.Stderr, append([]interface{}{"ERROR:"}, v...)...)
}

func (c *Console) Warn(v ...interface{}) {
	fmt.Println(append([]interface{}{"WARN:"}, v...)...)
}

func (c *Console) Info(v ...interface{}) {
	fmt.Println(append([]interface{}{"INFO:"}, v...)...)
}

func (c *Console) Debug(v ...interface{}) {
	fmt.Println(append([]interface{}{"DEBUG:"}, v...)...)
}

func (c *Console) Time(label string) {
	timers[label] = time.Now()
	fmt.Printf("%s: Timer started\n", label)
}

func (c *Console) TimeEnd(label string) {
	if start, exists := timers[label]; exists {
		elapsed := time.Since(start)
		fmt.Printf("%s: %v\n", label, elapsed)
		delete(timers, label)
	} else {
		c.Error("Timer not found:", label)
	}
}