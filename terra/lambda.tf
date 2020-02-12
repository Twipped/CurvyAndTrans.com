

resource "aws_iam_role" "lambda_execution" {
  name = "LambdaRole"
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
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:*"
      ],
      "Resource": "arn:aws:s3:::*"
    },
    {
      "Sid": "Invoke",
      "Effect": "Allow",
      "Action": [
        "lambda:InvokeFunction"
      ],
      "Resource": "arn:aws:lambda:*"
    }
  ]
}
EOF
}

data "archive_file" "lambda_redirect" {
  type        = "zip"
  output_path = "${path.module}/files/folder_index_redirect.js.zip"
  source_file = "${path.module}/files/folder_index_redirect.js"
}

resource "aws_lambda_function" "folder_index_redirect" {
  description      = "Managed by Terraform"
  filename         = "${path.module}/files/folder_index_redirect.js.zip"
  function_name    = "folder-index-redirect"
  handler          = "folder_index_redirect.handler"
  source_code_hash = data.archive_file.lambda_redirect.output_base64sha256
  publish          = true
  role             = aws_iam_role.lambda_execution.arn
  runtime          = "nodejs10.x"

  tags = {
    Name   = "${var.site}-index-redirect"
    Site = var.site
  }
}
