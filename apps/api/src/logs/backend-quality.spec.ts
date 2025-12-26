import { buildBackendQualityReport } from './backend-quality';

describe('buildBackendQualityReport', () => {
  it('aggregates HTTP requests by requestId', () => {
    const report = buildBackendQualityReport({
      httpEvents: [
        {
          timestampMs: 1000,
          eventName: 'network_request_start',
          requestId: 'r1',
          msgJson: { requestId: 'r1', url: 'https://api.example.com/v1/a?sn=SN1', method: 'GET' },
        },
        {
          timestampMs: 1100,
          eventName: 'network_request_success',
          requestId: 'r1',
          msgJson: { requestId: 'r1', url: 'https://api.example.com/v1/a?sn=SN1', method: 'GET', statusCode: 200, tookMs: 100 },
        },
        {
          timestampMs: 2000,
          eventName: 'network_request_start',
          requestId: 'r2',
          msgJson: { requestId: 'r2', url: 'https://api.example.com/v1/b', method: 'POST' },
        },
        {
          timestampMs: 2100,
          eventName: 'network_request_failed',
          requestId: 'r2',
          msgJson: { requestId: 'r2', url: 'https://api.example.com/v1/b', method: 'POST', statusCode: 500, tookMs: 100 },
        },
        {
          timestampMs: 3000,
          eventName: 'network_request_start',
          requestId: 'r3',
          msgJson: { requestId: 'r3', url: 'https://api.example.com/v1/c', method: 'GET' },
        },
      ],
      mqttEvents: [],
    });

    expect(report.summary.http).toEqual({
      total: 3,
      success: 1,
      failed: 1,
      missingEnd: 1,
      tookMsAvg: expect.any(Number),
      tookMsP95: expect.any(Number),
    });

    expect(report.http.failedRequests[0]?.requestId).toBe('r2');
    expect(report.http.missingEndRequests[0]?.requestId).toBe('r3');
    expect(report.http.endpoints.length).toBeGreaterThan(0);
  });

  it('classifies MQTT upload/ack issues and groups by device', () => {
    const report = buildBackendQualityReport({
      httpEvents: [],
      mqttEvents: [
        {
          timestampMs: 1000,
          eventName: 'info',
          deviceSn: 'SN-A',
          requestId: 'm1',
          errorCode: null,
          msgJson: '[Upload] 批次已发送等待ACK device=SN-A msgId=m1 count=10',
        },
        {
          timestampMs: 1200,
          eventName: 'warning',
          deviceSn: 'SN-A',
          requestId: 'm1',
          errorCode: null,
          msgJson: '[Ack] 超时未收到回执，回退并重试 device=SN-A msgId=m1',
        },
        {
          timestampMs: 1300,
          eventName: 'error_occurred',
          deviceSn: null,
          requestId: null,
          errorCode: 'MQTT_PUBLISH_FAILED',
          msgJson: { data: '[MQTT] 发布失败 topic=data/SN-B: not connected', code: 'MQTT_PUBLISH_FAILED' },
        },
      ],
    });

    expect(report.summary.mqtt.uploadBatchSent).toBe(1);
    expect(report.summary.mqtt.ackTimeout).toBe(1);
    expect(report.summary.mqtt.publishFailed).toBe(1);
    expect(report.summary.mqtt.issuesMissingDeviceSn).toBe(0);

    expect(report.mqtt.ackTimeouts[0]?.deviceSn).toBe('SN-A');
    expect(report.mqtt.issuesByDevice.find((d) => d.deviceSn === 'SN-A')?.ackTimeout).toBe(1);
    expect(report.mqtt.publishFailures[0]?.deviceSn).toBe('SN-B');
    expect(report.mqtt.issuesByDevice.find((d) => d.deviceSn === 'SN-B')?.publishFailed).toBe(1);
  });
});
