
data "archive_file" "logs_parse" {
  type        = "zip"
  source_dir  = "${path.module}/files/decorate"
  output_path = "${path.module}/files/decorate.zip"
}

resource "aws_lambda_permission" "allow_bucket" {
  statement_id  = "AllowExecutionFromS3Bucket"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.logs_parse.arn
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.logs.arn
}

resource "aws_lambda_function" "logs_parse" {
  filename      = data.archive_file.logs_parse.output_path
  function_name = "${var.site}-lambda"
  handler       = "index.handler"
  source_code_hash = data.archive_file.logs_parse.output_base64sha256
  runtime = "nodejs12.x"
  memory_size = "512"
  timeout = "24"
  role = aws_iam_role.lambda_execution.arn

  tags = {
    Name   = "${var.site}-log-dist"
    Site = var.site
  }
}

resource "aws_s3_bucket_notification" "bucket_notification" {
  bucket = aws_s3_bucket.logs.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.logs_parse.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "RAW/"
    filter_suffix       = ".gz"
  }
}

resource "aws_s3_bucket" "athena" {
  bucket = "${var.site}-athena"
  acl = "private"
  tags = {
    Name = "${var.site}-athena"
    Site = var.site
  }
}

resource "aws_athena_workgroup" "wg" {
  name = "${var.site}-wg"
  tags = {
    Name = "${var.site}-wg"
    Site = var.site
  }
}

resource "aws_athena_database" "db" {
  name = "eventsdb${var.site}"
  bucket = aws_s3_bucket.athena.id
}
