

resource "aws_s3_bucket" "redirect" {
  bucket = "www.${var.domain}"
  acl    = "public-read"

  website {
    redirect_all_requests_to = var.domain
  }

  tags = {
    Name = "Redirect"
    Site = var.site
  }
}


resource "aws_cloudfront_distribution" "site" {
  origin {
    domain_name = aws_s3_bucket.src.bucket_regional_domain_name
    origin_id   = "S3-Website-${aws_s3_bucket.src.website_endpoint}"

    custom_origin_config {
      origin_protocol_policy = "http-only"
      http_port = "80"
      https_port = "443"
      origin_ssl_protocols = ["TLSv1"]
    }
  }

  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"

  aliases = [
    var.domain,
    "www.${var.domain}"
  ]

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-Website-${aws_s3_bucket.src.website_endpoint}"

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }

    lambda_function_association {
      event_type   = "origin-request"
      lambda_arn   = aws_lambda_function.folder_index_redirect.qualified_arn
      include_body = false
    }

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = 86400
    max_ttl                = 31536000
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn       = aws_acm_certificate.cert.arn
    ssl_support_method        = "sni-only"
    minimum_protocol_version  = "TLSv1.1_2016"
  }

  tags = {
    Name = "Main Site"
    Site = var.site
  }
}

resource "aws_route53_record" "site" {
  name    = var.domain
  zone_id = aws_route53_zone.zone.zone_id
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "www" {
  name    = "www.${var.domain}"
  zone_id = aws_route53_zone.zone.zone_id
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
