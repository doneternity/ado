package mailer

import (
	"context"
	"fmt"
	"io"
	"os"
)

type console struct{ w io.Writer }

func NewConsole(w io.Writer) Mailer {
	if w == nil {
		w = os.Stdout
	}
	return &console{w: w}
}

func (c *console) SendVerification(_ context.Context, to, link string) error {
	_, err := fmt.Fprintf(c.w, "── VERIFY EMAIL ──\nto:   %s\nlink: %s\n──────────────────\n", to, link)
	return err
}
