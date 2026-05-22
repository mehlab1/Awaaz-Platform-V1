import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';

import { TRANSCRIPT_QUEUE } from './queue.constants';
import {
  TranscriptAssemblyService,
  type TranscriptJobData,
} from './transcript-assembly.service';

@Processor(TRANSCRIPT_QUEUE)
@Injectable()
export class TranscriptProcessor extends WorkerHost {
  constructor(private readonly transcriptAssembly: TranscriptAssemblyService) {
    super();
  }

  async process(job: Job<TranscriptJobData>): Promise<{
    callId: string;
    transcriptEntries: number;
    totalCostUsd: number;
  }> {
    await this.delay(3_000);
    return this.transcriptAssembly.assemble(job.data);
  }

  private async delay(milliseconds: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
