package models

import "github.com/google/uuid"

type Run struct {
	ID uuid.UUID `gorm:"type:uuid;default:gen_random_uuid();primaryKey"`

	UserID uuid.UUID

	Distance float64
	Duration int
	AvgPace  float64
}