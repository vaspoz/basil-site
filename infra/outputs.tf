output "zone_id" {
  value = data.aws_route53_zone.site.zone_id
}

output "records" {
  value = {
    apex_a    = aws_route53_record.apex_a.records
    apex_aaaa = aws_route53_record.apex_aaaa.records
    www       = aws_route53_record.www.records
  }
}
