package handlers

import (
	"net/http"

	"stridewars/backend/internal/repository"

	"github.com/gin-gonic/gin"
)

func Me(c *gin.Context) {

	id := c.MustGet("user_id").(string)

	user, err := repository.GetUserByID(id)

	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	c.JSON(http.StatusOK, user)
}