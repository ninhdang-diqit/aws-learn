package models

import (
	"time"
)

type Order struct {
	ID        uint      `json:"id"`
	UserID    string    `json:"user_id"`
	ItemName  string    `json:"item_name"`
	Amount    float64   `json:"amount"`
	Status    string    `json:"status"` // e.g. "CREATED", "PROCESSED"
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
