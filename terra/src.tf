
resource "aws_iam_user" "s3" {
  name = "s3"
  path = "/${var.site}/"

  tags = {
    Site = var.site
    Category = "S3"
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
