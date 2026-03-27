package elastic

import (
	"log"
	"sync"

	"github.com/elastic/go-elasticsearch/v8"
)

var (
	esInstance *elasticsearch.Client
	esOnce     sync.Once
)

func InitElasticSearch(url string) {
	esOnce.Do(func() {
		cfg := elasticsearch.Config{
			Addresses: []string{url},
		}
		var err error
		esInstance, err = elasticsearch.NewClient(cfg)
		if err != nil {
			log.Fatalf("Error creating the elastic search client: %s", err)
		}

		res, err := esInstance.Info()
		if err != nil {
			log.Fatalf("Error getting response from ES: %s", err)
		}
		defer res.Body.Close()
	})
}

func GetInstance() *elasticsearch.Client {
	if esInstance == nil {
		log.Println("ElasticSearch instance is nil. Did you call InitElasticSearch?")
	}
	return esInstance
}

