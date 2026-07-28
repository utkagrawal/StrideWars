package models

type Territory struct {
	H3Index string `gorm:"primaryKey"`

	OwnerID string

	Influence int
}