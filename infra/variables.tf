variable "aws_profile" {
  description = "AWS CLI profile for the account that holds the hosted zone."
  type        = string
  default     = "posterito-prod"
}

variable "aws_region" {
  description = "Provider region. Route53 is global; this only satisfies the provider."
  type        = string
  default     = "eu-central-1"
}

variable "domain" {
  description = "Apex domain served by GitHub Pages. Must match the CNAME file in the repo root."
  type        = string
  default     = "sediadigital.com"
}

variable "github_user" {
  description = "GitHub account that owns the Pages site; www points at <user>.github.io."
  type        = string
  default     = "vaspoz"
}

variable "github_pages_verification" {
  description = "Value of the _github-pages-challenge TXT record from GitHub account settings > Pages > Verified domains. Leave empty to skip."
  type        = string
  default     = "b5f50581c6f7b842052d793fc3c1f2"
}

variable "ttl" {
  description = "TTL in seconds for the records created here."
  type        = number
  default     = 300
}
