package middleware

import (
	"net/http/httptest"
	"testing"
)

func TestClientIP(t *testing.T) {
	t.Cleanup(func() { ConfigureClientIP("", 1) })

	cases := []struct {
		name   string
		header string
		hops   int
		xff    string
		other  map[string]string
		remote string
		want   string
	}{
		{name: "rightmost by default", hops: 1, xff: "6.6.6.6, 1.1.1.1, 2.2.2.2", want: "2.2.2.2"},
		{name: "two trusted hops", hops: 2, xff: "6.6.6.6, 1.1.1.1, 2.2.2.2", want: "1.1.1.1"},
		{name: "more hops than entries", hops: 5, xff: "1.1.1.1", want: "1.1.1.1"},
		{name: "blank entries ignored", hops: 1, xff: "1.1.1.1, , ", want: "1.1.1.1"},
		{name: "configured header wins", header: "X-Real-Ip", hops: 1, xff: "9.9.9.9", other: map[string]string{"X-Real-Ip": "3.3.3.3"}, want: "3.3.3.3"},
		{name: "missing header falls back", header: "X-Real-Ip", hops: 1, xff: "9.9.9.9", want: "9.9.9.9"},
		{name: "remote addr without xff", hops: 1, remote: "4.4.4.4:5555", want: "4.4.4.4"},
		{name: "ipv6 remote addr", hops: 1, remote: "[2001:db8::1]:443", want: "2001:db8::1"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ConfigureClientIP(tc.header, tc.hops)
			r := httptest.NewRequest("GET", "/", nil)
			if tc.remote != "" {
				r.RemoteAddr = tc.remote
			}
			if tc.xff != "" {
				r.Header.Set("X-Forwarded-For", tc.xff)
			}
			for k, v := range tc.other {
				r.Header.Set(k, v)
			}
			if got := ClientIP(r); got != tc.want {
				t.Fatalf("ClientIP = %q, want %q", got, tc.want)
			}
		})
	}
}
