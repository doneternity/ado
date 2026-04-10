package mailer

import "context"

type Mailer interface {
	SendVerification(ctx context.Context, to, link string) error
}
