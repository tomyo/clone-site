.DEFAULT_GOAL := help

# --- Variables ---
from ?= 
depth ?= 0
includeVideos ?= false

.PHONY: help
help: ## Show this help message
	@echo "Usage: make [target] [variables]"
	@echo ""
	@echo "Targets:"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "Variables:"
	@echo "  from=<url>                    The domain or URL to process"
	@echo "  depth=<0|1|2...>              Crawl multiple pages down to a specific depth (default: 0, just one page)"
	@echo "  includeVideos=true|false      Download heavy media files like mp4 (default: false)"

.PHONY: site-clone
site-clone: ## Create a perfect static visual clone of a site
	@if [ -z "$(from)" ]; then \
		echo "Error: Please provide a URL using 'make site-clone from=<url>'"; \
		exit 1; \
	fi
	@node src/index.js $(from) --depth=$(depth) --include-videos=$(includeVideos)