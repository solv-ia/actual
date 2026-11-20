# Single-instance AWS deployment

This Compose stack runs Actual behind Caddy. The `actual-data` directory holds
the budget data and must be backed up. Caddy obtains and renews the HTTPS
certificate once `ACTUAL_HOSTNAME` resolves to the instance.

Copy `.env.example` to `.env` on the server, then set the hostname and image.
Keep `.env` and the data directories outside the public repository. Start the
stack with `docker compose up -d` from this directory.

The fork image workflow publishes an ARM64 image to a private Amazon ECR
repository. It uses GitHub OIDC through the `AWS_ECR_PUSH_ROLE_ARN` repository
variable, so no AWS access key is stored in GitHub. The EC2 instance needs an
IAM role with read access to that ECR repository and the Amazon ECR Docker
credential helper.

After a new image is published, set `ACTUAL_IMAGE` in the server's `.env` to
the desired image tag and run:

```sh
docker compose pull actual
docker compose up -d actual
```

Use an immutable `sha-...` tag when checking a deployment. The `latest` tag is
published from the fork's `master` branch.
