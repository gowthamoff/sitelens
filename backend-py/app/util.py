"""Small helpers shared by services."""
from concurrent.futures import ThreadPoolExecutor


def gather(*funcs):
    """Run zero-arg callables concurrently and return results in order.

    Stand-in for the JS `Promise.all([...])` the services used to parallelize
    independent PostGIS queries. Each callable borrows its own pooled connection
    (see db.pool), so they can run on separate threads safely.
    """
    funcs = list(funcs)
    if len(funcs) == 1:
        return [funcs[0]()]
    with ThreadPoolExecutor(max_workers=len(funcs)) as ex:
        return [f.result() for f in [ex.submit(fn) for fn in funcs]]


def gather_map(fn, items):
    """Like gather but maps `fn` over `items` concurrently, preserving order."""
    items = list(items)
    if not items:
        return []
    if len(items) == 1:
        return [fn(items[0])]
    with ThreadPoolExecutor(max_workers=min(len(items), 9)) as ex:
        futures = [ex.submit(fn, it) for it in items]
        return [f.result() for f in futures]
