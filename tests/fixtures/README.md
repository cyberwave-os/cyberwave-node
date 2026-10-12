`image-actions.json` is a test snapshot of the backend canonical structured task registry, not a runtime SDK task catalog. Refresh from the matching backend checkout (in Docker):

```sh
docker exec BACKEND_CONTAINER python -c "import json; from src.lib.structured_actions import catalog_as_dict; print(json.dumps({a['id']:a for a in catalog_as_dict()['actions'] if a['image_annotation']},indent=2))" > tests/fixtures/image-actions.json
```

Runtime task discovery always uses the generated API client.
