"""Ingestion queue — processes file ingestion tasks sequentially."""

import asyncio
import logging
from collections import deque

from app.services.ingestion import ingest_file

logger = logging.getLogger(__name__)


class IngestionQueue:
    """Async queue that processes file ingestion one at a time."""

    def __init__(self, max_concurrent: int = 1):
        self._queue: asyncio.Queue[int] = asyncio.Queue()
        self._max_concurrent = max_concurrent
        self._workers: list[asyncio.Task] = []
        self._processing: set[int] = set()
        self._pending: deque[int] = deque()

    async def start(self):
        """Start worker tasks."""
        for i in range(self._max_concurrent):
            task = asyncio.create_task(self._worker(i))
            self._workers.append(task)
        logger.info(f"[Queue] Started {self._max_concurrent} ingestion worker(s)")

    async def stop(self):
        """Stop worker tasks gracefully."""
        for _ in self._workers:
            await self._queue.put(-1)  # Sentinel to stop workers
        await asyncio.gather(*self._workers, return_exceptions=True)
        self._workers.clear()
        logger.info("[Queue] Stopped all ingestion workers")

    async def enqueue(self, file_id: int):
        """Add a file to the ingestion queue."""
        self._pending.append(file_id)
        await self._queue.put(file_id)
        position = self._queue.qsize()
        logger.info(f"[Queue] Enqueued file_id={file_id} (queue size: {position})")

    @property
    def queue_size(self) -> int:
        return self._queue.qsize()

    @property
    def is_processing(self) -> bool:
        return len(self._processing) > 0

    async def _worker(self, worker_id: int):
        """Worker that processes ingestion tasks from the queue."""
        logger.info(f"[Queue] Worker {worker_id} ready")
        while True:
            file_id = await self._queue.get()

            # Sentinel value — stop the worker
            if file_id == -1:
                break

            self._processing.add(file_id)
            if file_id in self._pending:
                self._pending.remove(file_id)

            try:
                logger.info(f"[Queue] Worker {worker_id} processing file_id={file_id}")
                await ingest_file(file_id)
                logger.info(f"[Queue] Worker {worker_id} completed file_id={file_id}")
            except Exception as e:
                logger.error(f"[Queue] Worker {worker_id} failed file_id={file_id}: {e}")
            finally:
                self._processing.discard(file_id)
                self._queue.task_done()


# Singleton instance
ingestion_queue = IngestionQueue(max_concurrent=1)
