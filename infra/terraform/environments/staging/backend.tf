terraform {
  backend "s3" {
    bucket         = "charityapp-tfstate-jk7f2a9x"
    key            = "staging/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "charityapp-tf-locks"
    encrypt        = true
  }
}