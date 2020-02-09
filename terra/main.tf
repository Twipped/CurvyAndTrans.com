
variable "site" {
  type = string
  description = "The base domain name of the site that all these belong to."
  default = "curvyandtrans"
}

variable "domain" {
  type = string
  description = "The base domain name of the site that all these belong to."
  default = "curvyandtrans.com"
}

variable "subdomains" {
    type = list
    default = [
        "www",
        "t"
    ]
}

provider "aws" {
  profile    = "default"
  region     = "us-east-1"
}

resource "aws_iam_user" "s3" {
  name = "s3"
  path = "/${var.site}/"

  tags = {
    Site = var.site
    Category = "S3"
  }
}

resource "aws_route53_zone" "zone" {
  name = var.domain

  tags = {
    Site = var.site
    Category = "DNS"
  }
}

resource "aws_acm_certificate" "cert" {
  domain_name       = var.domain
  validation_method = "DNS"

  subject_alternative_names = formatlist("%s.%s",
    var.subdomains,
    var.domain,
  )

  tags = {
    Name = "Site Certificate"
    Site = var.site
    Category = "SSL"
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "cert_validation" {
  count   = length(aws_acm_certificate.cert.subject_alternative_names) + 1
  zone_id = aws_route53_zone.zone.id
  ttl     = 60

  name    = aws_acm_certificate.cert.domain_validation_options[count.index].resource_record_name
  type    = aws_acm_certificate.cert.domain_validation_options[count.index].resource_record_type
  records = [aws_acm_certificate.cert.domain_validation_options[count.index].resource_record_value]
}

resource "aws_acm_certificate_validation" "cert" {
  certificate_arn         = aws_acm_certificate.cert.arn
  validation_record_fqdns = aws_route53_record.cert_validation[*].fqdn
}

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

resource "aws_s3_bucket" "src" {
  bucket = var.domain
  acl    = "public-read"

  website {
    index_document = "index.html"
    error_document = "404.html"
  }

  tags = {
    Name = "Site Source"
    Site = var.site
  }
}


resource "aws_s3_bucket_policy" "src" {
  bucket = aws_s3_bucket.src.bucket
  policy = <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "${aws_iam_user.s3.arn}"
      },
      "Action": "s3:ListBucket",
      "Resource": "${aws_s3_bucket.src.arn}"
    },
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "${aws_iam_user.s3.arn}"
      },
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:GetObject",
        "s3:GetObjectAcl",
        "s3:DeleteObject",
        "s3:ListMultipartUploadParts",
        "s3:AbortMultipartUpload"
      ],
      "Resource": "${aws_s3_bucket.src.arn}/*"
    },
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "${aws_s3_bucket.src.arn}/*"
    }
  ]
}
POLICY
}

resource "aws_s3_bucket" "pixel" {
  bucket = "t.${var.domain}"
  acl    = "public-read"

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }

  tags = {
    Name = "Tracking Pixel"
    Site = var.site
  }
}

resource "aws_s3_bucket_object" "ipixel" {
  bucket       = aws_s3_bucket.pixel.bucket
  key          = "i"
  source       = "${path.module}/files/i.gif"
  etag         = filemd5("${path.module}/files/i.gif")
  acl          = "public-read"
  content_type = "image/gif"
}

resource "aws_s3_bucket" "logs" {
  bucket = "${var.site}-analytics"

  tags = {
    Name = "Logs Storage"
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

resource "aws_cloudfront_distribution" "tracking" {
  origin {
    domain_name = aws_s3_bucket.pixel.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.pixel.bucket}"
  }

  enabled         = true
  is_ipv6_enabled = true
  comment         = "Cloudfront distribution for snowplow tracking pixel"

  logging_config {
    include_cookies = true
    bucket          = aws_s3_bucket.logs.bucket_regional_domain_name
    prefix          = "RAW"
  }

  aliases = [
    "t.${var.domain}"
  ]

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${aws_s3_bucket.pixel.bucket}"

    forwarded_values {
      query_string = true

      cookies {
        forward = "all"
      }

      headers = [
        "Origin",
        "Access-Control-Request-Headers",
        "Access-Control-Request-Method",
      ]
    }

    viewer_protocol_policy = "allow-all"
    min_ttl                = 0
    default_ttl            = 3600
    max_ttl                = 86400
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn = aws_acm_certificate.cert.arn
    ssl_support_method  = "sni-only"
  }

  tags = {
    Name = "Tracking Site"
    Site = var.site
  }
}

resource "aws_route53_record" "tracking" {
  name    = "t.${var.domain}"
  zone_id = aws_route53_zone.zone.zone_id
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.tracking.domain_name
    zone_id                = aws_cloudfront_distribution.tracking.hosted_zone_id
    evaluate_target_health = false
  }
}

data "archive_file" "folder_index_redirect_zip" {
  type        = "zip"
  output_path = "${path.module}/files/folder_index_redirect.js.zip"
  source_file = "${path.module}/files/folder_index_redirect.js"
}

resource "aws_iam_role_policy" "lambda_execution" {
  name_prefix = "lambda-execution-policy-"
  role        = aws_iam_role.lambda_execution.id

  policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:CreateLogGroup"
      ],
      "Effect": "Allow",
      "Resource": "*"
    }
  ]
}
EOF
}

resource "aws_iam_role" "lambda_execution" {
  name_prefix        = "lambda-execution-role-"
  description        = "Managed by Terraform"
  assume_role_policy = <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Action": "sts:AssumeRole",
      "Principal": {
        "Service": [
          "edgelambda.amazonaws.com",
          "lambda.amazonaws.com"
        ]
      },
      "Effect": "Allow",
      "Sid": ""
    }
  ]
}
EOF

  tags = {
    Site = var.site
  }
}

resource "aws_lambda_function" "folder_index_redirect" {
  description      = "Managed by Terraform"
  filename         = "${path.module}/files/folder_index_redirect.js.zip"
  function_name    = "folder-index-redirect"
  handler          = "folder_index_redirect.handler"
  source_code_hash = data.archive_file.folder_index_redirect_zip.output_base64sha256
  publish          = true
  role             = aws_iam_role.lambda_execution.arn
  runtime          = "nodejs10.x"

  tags = {
    Site = var.site
  }
}
