# DNS for the GitHub Pages site. Only adds web records to the existing zone;
# the Proton Mail (MX, SPF/verify TXT, DKIM, DMARC) and SES records are
# managed elsewhere and are not touched.

data "aws_route53_zone" "site" {
  name         = var.domain
  private_zone = false
}

locals {
  # https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-an-apex-domain
  github_pages_ipv4 = [
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153",
  ]
  github_pages_ipv6 = [
    "2606:50c0:8000::153",
    "2606:50c0:8001::153",
    "2606:50c0:8002::153",
    "2606:50c0:8003::153",
  ]
}

resource "aws_route53_record" "apex_a" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = var.domain
  type    = "A"
  ttl     = var.ttl
  records = local.github_pages_ipv4
}

resource "aws_route53_record" "apex_aaaa" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = var.domain
  type    = "AAAA"
  ttl     = var.ttl
  records = local.github_pages_ipv6
}

# GitHub redirects www to the apex once both resolve to Pages.
resource "aws_route53_record" "www" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = "www.${var.domain}"
  type    = "CNAME"
  ttl     = var.ttl
  records = ["${var.github_user}.github.io"]
}

# Domain verification stops other GitHub accounts from claiming the domain.
resource "aws_route53_record" "github_pages_challenge" {
  count = var.github_pages_verification == "" ? 0 : 1

  zone_id = data.aws_route53_zone.site.zone_id
  name    = "_github-pages-challenge-${var.github_user}.${var.domain}"
  type    = "TXT"
  ttl     = var.ttl
  records = [var.github_pages_verification]
}
